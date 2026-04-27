import forge from "node-forge";
import http2 from "node:http2";

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

    client.on("error", (err) => { client.destroy(); reject(err); });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${pushToken}`,
      "apns-topic": passTypeId,
      "apns-push-type": "background",
      "content-type": "application/json",
    });

    req.write("{}");
    req.end();

    req.on("response", (headers) => {
      client.close();
      const status = headers[":status"];
      if (status === 200) resolve();
      else reject(new Error(`APNs status ${status}`));
    });

    req.on("error", (err) => { client.close(); reject(err); });
  });
}
