import { NextResponse } from "next/server";
import { PKPass } from "passkit-generator";
import forge from "node-forge";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import path from "path";
import fs from "fs";

// Apple WWDR G4 をモジュールスコープでキャッシュ
let wwdrPemCache: string | null = null;
async function getWWDR(): Promise<string> {
  if (wwdrPemCache) return wwdrPemCache;
  const res = await fetch("https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer");
  const buf = Buffer.from(await res.arrayBuffer());
  const b64 = buf.toString("base64");
  wwdrPemCache = [
    "-----BEGIN CERTIFICATE-----",
    ...(b64.match(/.{1,64}/g) ?? []),
    "-----END CERTIFICATE-----",
  ].join("\n");
  return wwdrPemCache;
}

function extractFromP12(p12Base64: string, password: string): { certPem: string; keyPem: string } {
  const p12Der = forge.util.createBuffer(
    Buffer.from(p12Base64, "base64").toString("binary")
  );
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const cert = certBags[forge.pki.oids.certBag]?.[0]?.cert;

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const key = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;

  if (!cert || !key) throw new Error("p12 から証明書または秘密鍵を抽出できませんでした");

  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(key as forge.pki.rsa.PrivateKey),
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  const { transactionId } = await params;

  const admin = createAdminClient();
  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select(`
      transaction_id, total_gross_amount, created_at, sequence_number_in_event,
      product:products!product_id(name, artist_id, artist:profiles!artist_id(display_name)),
      qr_config:qr_configs!qr_config_id(
        event_id,
        image_url,
        event:events!event_id(title)
      )
    `)
    .eq("transaction_id", transactionId)
    .eq("status", "completed")
    .single();

  if (txErr || !tx) {
    console.error("[wallet/pass] tx fetch error:", txErr?.message);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const p12Base64 = process.env.APPLE_PASS_CERTIFICATE_P12_BASE64;
  const p12Password = process.env.APPLE_PASS_CERTIFICATE_PASSWORD ?? "";
  const passTypeId = process.env.APPLE_PASS_TYPE_ID;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!p12Base64 || !passTypeId || !teamId) {
    console.error("[wallet/pass] missing env:", {
      hasP12: !!p12Base64,
      hasPassTypeId: !!passTypeId,
      hasTeamId: !!teamId,
    });
    return NextResponse.json({ error: "Apple Wallet設定が不完全です" }, { status: 500 });
  }

  const artistName = (tx.product as any)?.artist?.display_name ?? "Artist";
  const eventTitle = (tx.qr_config as any)?.event?.title ?? "";
  const amount = tx.total_gross_amount ?? 0;
  const serialNumber = tx.sequence_number_in_event ?? 0;
  const txDate = new Date(tx.created_at).toLocaleDateString("ja-JP");

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    serialNumber: tx.transaction_id,
    teamIdentifier: teamId,
    organizationName: "direct cheers",
    description: `Cheers to ${artistName}`,
    backgroundColor: "rgb(2, 6, 23)",
    foregroundColor: "rgb(255, 255, 255)",
    labelColor: "rgb(148, 163, 184)",
    logoText: "direct cheers",
    storeCard: {
      headerFields: [
        { key: "artist", label: "ARTIST", value: artistName },
      ],
      secondaryFields: [
        { key: "event", label: "EVENT", value: eventTitle || "—" },
        {
          key: "amount",
          label: "CHEERS",
          value: `¥${amount.toLocaleString("ja-JP")}`,
        },
      ],
      auxiliaryFields: [
        {
          key: "serial",
          label: "No.",
          value: `#${String(serialNumber).padStart(3, "0")}`,
        },
        { key: "date", label: "DATE", value: txDate },
      ],
      backFields: [
        { key: "txid", label: "Transaction ID", value: tx.transaction_id },
        {
          key: "site",
          label: "direct cheers",
          value: "https://direct-cheers.com",
        },
      ],
    },
  };

  // logo-emblem.png をアイコン・ロゴ各サイズにリサイズ
  const logoPath = path.join(process.cwd(), "public", "logo-emblem.png");
  const logoBuffer = fs.readFileSync(logoPath);

  // strip: QR画像があればそれを使い、なければロゴエンブレムをセンタリング (2x=640x426 ≈ 3:2)
  const qrImageUrl = (tx.qr_config as any)?.image_url as string | null | undefined;
  let strip2xRaw: Buffer;
  if (qrImageUrl) {
    const imgRes = await fetch(qrImageUrl);
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
    strip2xRaw = await sharp(imgBuf)
      .resize(640, 426, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
  } else {
    const emblemForStrip = await sharp(logoBuffer)
      .resize(200, 200, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    strip2xRaw = await sharp({
      create: { width: 640, height: 426, channels: 4, background: { r: 2, g: 6, b: 23, alpha: 255 } },
    })
      .composite([{ input: emblemForStrip, gravity: "centre" }])
      .png()
      .toBuffer();
  }

  const [icon1x, icon2x, icon3x, logo1x, logo2x, strip1x, strip2x, strip3x] = await Promise.all([
    sharp(logoBuffer).resize(29, 29).png().toBuffer(),
    sharp(logoBuffer).resize(58, 58).png().toBuffer(),
    sharp(logoBuffer).resize(87, 87).png().toBuffer(),
    sharp(logoBuffer).resize(160, 50, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
    sharp(logoBuffer).resize(320, 100, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
    sharp(strip2xRaw).resize(320, 213).png().toBuffer(),
    Promise.resolve(strip2xRaw),
    sharp(strip2xRaw).resize(960, 639).png().toBuffer(),
  ]);

  const [wwdrPem, { certPem, keyPem }] = await Promise.all([
    getWWDR(),
    Promise.resolve(extractFromP12(p12Base64, p12Password)),
  ]);

  const pass = new PKPass(
    {
      "pass.json": Buffer.from(JSON.stringify(passJson)),
      "icon.png": icon1x,
      "icon@2x.png": icon2x,
      "icon@3x.png": icon3x,
      "logo.png": logo1x,
      "logo@2x.png": logo2x,
      "strip.png": strip1x,
      "strip@2x.png": strip2x,
      "strip@3x.png": strip3x,
    },
    {
      wwdr: wwdrPem,
      signerCert: certPem,
      signerKey: keyPem,
      signerKeyPassphrase: p12Password,
    }
  );

  const pkpassBuffer = pass.getAsBuffer();

  return new NextResponse(pkpassBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="cheers-${tx.transaction_id}.pkpass"`,
    },
  });
}
