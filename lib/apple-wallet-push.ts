import forge from "node-forge";
import http2 from "node:http2";
import { createAdminClient } from "@/lib/supabase/admin";

function extractFromP12(p12Base64: string, password: string) {
  const p12Der = forge.util.createBuffer(
    Buffer.from(p12Base64, "base64").toString("binary")
  );
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const cert = certBags[forge.pki.oids.certBag]?.[0]?.cert;
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const key = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;
  if (!cert || !key) throw new Error("p12 extract failed");
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(key as forge.pki.rsa.PrivateKey),
  };
}

export async function sendWalletPush(pushToken: string): Promise<void> {
  const p12Base64 = process.env.APPLE_PASS_CERTIFICATE_P12_BASE64;
  const password = process.env.APPLE_PASS_CERTIFICATE_PASSWORD ?? "";
  const passTypeId = process.env.APPLE_PASS_TYPE_ID;
  if (!p12Base64 || !passTypeId) throw new Error("Apple Wallet env missing");

  const { certPem, keyPem } = extractFromP12(p12Base64, password);

  return new Promise((resolve, reject) => {
    const client = http2.connect("https://api.push.apple.com", {
      cert: certPem,
      key: keyPem,
    });

    client.on("error", (err) => {
      console.error("[wallet/push] http2 connect error:", err.message);
      client.destroy();
      reject(err);
    });

    const body = JSON.stringify({});
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${pushToken}`,
      "apns-topic": passTypeId,
      "apns-priority": "5",
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body).toString(),
    });

    req.write(body);
    req.end();

    let responseData = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { responseData += chunk; });

    req.on("response", (headers) => {
      const status = headers[":status"];
      req.on("end", () => {
        client.close();
        if (status === 200) {
          console.log("[wallet/push] sent ok:", pushToken.slice(0, 8));
          resolve();
        } else {
          console.error("[wallet/push] APNs error status:", status, responseData);
          reject(new Error(`APNs status ${status}: ${responseData}`));
        }
      });
    });

    req.on("error", (err) => {
      console.error("[wallet/push] req error:", err.message);
      client.close();
      reject(err);
    });
  });
}

// serial_number（ticket_id または transaction_id）に紐づく全デバイスへpush
// pass_updated_at を現在時刻に更新して passesUpdatedSince フィルタに対応する
export async function pushWalletUpdateBySerial(serialNumber: string): Promise<void> {
  const admin = createAdminClient();
  const { data: devices } = await admin
    .from("wallet_device_registrations")
    .select("push_token")
    .eq("serial_number", serialNumber);

  const tokens = [...new Set((devices ?? []).map((d) => d.push_token))];
  if (tokens.length === 0) return;

  const now = new Date().toISOString();

  const [pushResults] = await Promise.all([
    Promise.allSettled(tokens.map((t) => sendWalletPush(t))),
    // pass_updated_at を更新して passesUpdatedSince で正しくフィルタされるようにする
    admin
      .from("wallet_device_registrations")
      .update({ pass_updated_at: now })
      .eq("serial_number", serialNumber),
  ]);

  pushResults.forEach((r) => {
    if (r.status === "rejected") console.error("[wallet/push] failed:", r.reason);
  });
}
