import { PKPass } from "passkit-generator";
import forge from "node-forge";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCheerCardIdentity } from "@/lib/statement-descriptor";
import path from "path";
import fs from "fs";

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
  if (!cert || !key) throw new Error("p12 から証明書または秘密鍵を抽出できませんでした");
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(key as forge.pki.rsa.PrivateKey),
  };
}

export async function generateTicketPassBuffer(ticketId: string): Promise<Buffer> {
  const admin = createAdminClient();
  const { data: ticket, error } = await admin
    .from("tickets")
    .select(`
      ticket_id, ticket_code, status, created_at, checked_in_at,
      product:products!product_id(name, payment_type, min_amount),
      event:events!event_id(title, venue, start_at),
      transaction:transactions!transaction_id(total_gross_amount, qr_config_id)
    `)
    .eq("ticket_id", ticketId)
    .single();

  if (error || !ticket) throw Object.assign(new Error("Not found"), { status: 404 });
  if (ticket.status === "cancelled") throw Object.assign(new Error("Ticket cancelled"), { status: 410 });

  // ── ステータスに応じた外観設定 ──────────────────────────────────────
  const isUsed      = ticket.status === "used";
  const isSuspended = ticket.status === "suspended";

  // 入場済: ダークグリーン・QR維持・入場済バッジ＋入場時刻
  // 支払い問題: アンバー系警告色・QR非表示
  // 有効: 通常色（QRデザインから取得）

  // 入場時刻フォーマット（入場済の場合のみ）
  const checkedInAt = (ticket as any).checked_in_at as string | null;
  const checkedInStr = checkedInAt
    ? new Date(checkedInAt).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      }).replace(/\//g, "/")
    : null;

  const qrConfigId = (ticket.transaction as any)?.qr_config_id as string | null;
  const { data: qrDesign } = qrConfigId
    ? await admin.from("qr_configs").select("strip_image_url, bg_color, fg_color, label_color").eq("qr_config_id", qrConfigId).single()
    : { data: null };

  const p12Base64 = process.env.APPLE_PASS_CERTIFICATE_P12_BASE64;
  const p12Password = process.env.APPLE_PASS_CERTIFICATE_PASSWORD ?? "";
  const passTypeId = process.env.APPLE_PASS_TYPE_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const serviceBaseUrl = process.env.APPLE_WALLET_SERVICE_URL;
  const authToken = process.env.WALLET_AUTH_SECRET;

  if (!p12Base64 || !passTypeId || !teamId) {
    throw Object.assign(new Error("Apple Wallet設定が不完全です"), { status: 500 });
  }

  const eventTitle = (ticket.event as any)?.title ?? "Event";
  const venue = (ticket.event as any)?.venue ?? null;
  const startAt = (ticket.event as any)?.start_at ?? null;
  const productName = (ticket.product as any)?.name ?? "Ticket";
  const amount = (ticket.transaction as any)?.total_gross_amount ?? (ticket.product as any)?.min_amount ?? 0;

  const fmtDate = startAt
    ? new Date(startAt).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const statusBgHex = isUsed      ? "#14532d"   // 入場済: ダークグリーン（有効との差別化）
                    : isSuspended ? "#78350f"   // 要確認: アンバー
                    : null;                     // 有効: QRデザインから取得

  const statusFgHex = isUsed      ? "#bbf7d0"   // 入場済: ライトグリーン文字
                    : isSuspended ? "#fcd34d"   // 要確認: 黄色文字
                    : null;

  const hexToRgb = (hex: string) => {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgb(${r}, ${g}, ${b})`;
  };
  const bgColorHex  = statusBgHex  ?? qrDesign?.bg_color  ?? "#0f172a";
  const fgColorHex  = statusFgHex  ?? qrDesign?.fg_color  ?? "#ffffff";
  const lblColorHex = isSuspended ? "#92400e" : (qrDesign?.label_color ?? "#94a3b8");
  const stripImageUrl = qrDesign?.strip_image_url ?? null;

  const passJson: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    serialNumber: ticket.ticket_id,
    teamIdentifier: teamId,
    organizationName: "direct cheers",
    description: eventTitle,
    backgroundColor: hexToRgb(bgColorHex),
    foregroundColor: hexToRgb(fgColorHex),
    labelColor: hexToRgb(lblColorHex),
    logoText: "direct cheers",
    // 支払い問題の場合のみQRを非表示（入場済はQR維持＝再入場対応）
    ...(!isSuspended ? {
      barcodes: [{
        message: ticket.ticket_code,
        format: "PKBarcodeFormatQR",
        messageEncoding: "iso-8859-1",
        altText: ticket.ticket_code.slice(0, 8).toUpperCase(),
      }],
    } : {}),
    eventTicket: {
      headerFields: [
        ...(isUsed      ? [{ key: "badge", label: "", value: "✅ 入場済（再入場可）" }] : []),
        ...(isSuspended ? [{ key: "badge", label: "", value: "⚠️ 支払いご確認ください" }] : []),
      ],
      primaryFields: [
        { key: "event", label: "EVENT", value: eventTitle },
      ],
      secondaryFields: [
        ...(fmtDate ? [{ key: "date", label: "DATE", value: fmtDate }] : []),
        ...(venue ? [{ key: "venue", label: "VENUE", value: venue }] : []),
      ],
      auxiliaryFields: [
        { key: "ticket", label: "TICKET", value: productName },
        { key: "amount", label: "AMOUNT", value: amount === 0 ? "Invitation" : `¥${amount.toLocaleString("ja-JP")}` },
      ],
      backFields: [
        // 入場済の場合は入場時刻を先頭に表示
        ...(isUsed && checkedInStr
          ? [{ key: "checkedin", label: "入場時刻", value: checkedInStr }]
          : []),
        { key: "ticketid", label: "Ticket ID", value: ticket.ticket_id },
        { key: "site", label: "direct cheers", value: "https://direct-cheers.com" },
      ],
    },
  };

  if (serviceBaseUrl && authToken) {
    passJson.webServiceURL = serviceBaseUrl;
    passJson.authenticationToken = authToken;
  }

  const logoPath = path.join(process.cwd(), "public", "logo-emblem.png");
  const logoBuffer = fs.readFileSync(logoPath);

  // strip画像: アップロード済みなら取得、なければ背景色+ロゴのフォールバック
  let strip3xRaw: Buffer;
  if (stripImageUrl) {
    const imgRes = await fetch(stripImageUrl, { cache: "no-store" });
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
    strip3xRaw = await sharp(imgBuf).resize(1125, 294, { fit: "cover", position: "centre" }).png().toBuffer();
  } else {
    const bgHex = bgColorHex.replace("#", "");
    const bgR = parseInt(bgHex.slice(0, 2), 16);
    const bgG = parseInt(bgHex.slice(2, 4), 16);
    const bgB = parseInt(bgHex.slice(4, 6), 16);
    strip3xRaw = await sharp({
      create: { width: 1125, height: 294, channels: 4, background: { r: bgR, g: bgG, b: bgB, alpha: 255 } },
    })
      .composite([{
        input: await sharp(logoBuffer)
          .resize(120, 120, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer(),
        gravity: "centre",
      }])
      .png()
      .toBuffer();
  }

  const [icon1x, icon2x, icon3x, logo1x, logo2x, strip1x, strip2x, strip3x] = await Promise.all([
    sharp(logoBuffer).resize(29, 29).png().toBuffer(),
    sharp(logoBuffer).resize(58, 58).png().toBuffer(),
    sharp(logoBuffer).resize(87, 87).png().toBuffer(),
    sharp(logoBuffer).resize(50, 50).png().toBuffer(),
    sharp(logoBuffer).resize(100, 100).png().toBuffer(),
    sharp(strip3xRaw).resize(375, 98, { fit: "cover" }).png().toBuffer(),
    sharp(strip3xRaw).resize(750, 196, { fit: "cover" }).png().toBuffer(),
    Promise.resolve(strip3xRaw),
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

  return pass.getAsBuffer() as unknown as Buffer;
}

/**
 * チアのWalletパスに表示する名前・画像を解決する（DBアクセスのみ・証明書等のIOは含まない）。
 * generatePassBuffer から分離しているのは、証明書を必要とせずに単体テストできるようにするため
 * （名前・画像の解決ロジックの正しさと、Walletパス自体の生成成否は別の関心事）。
 */
export async function resolveCheerPassIdentity(
  admin: ReturnType<typeof createAdminClient>,
  tx: {
    product?: { artist?: { display_name: string | null; artist_name: string | null; avatar_url: string | null } | null } | null;
    qr_config?: {
      recipient_profile_id?: string | null;
      recipient_name_context?: string | null;
    } | null;
  },
): Promise<{ name: string; avatarUrl: string | null }> {
  const artistRaw = (tx.product as any)?.artist;
  const recipientNameContext = ((tx.qr_config as any)?.recipient_name_context as "organizer" | "artist" | undefined) ?? "artist";
  const recipientProfileId = (tx.qr_config as any)?.recipient_profile_id as string | null | undefined;

  let recipientProfile: {
    display_name: string | null; artist_name: string | null; organizer_name: string | null;
    avatar_url: string | null; artist_avatar_url: string | null; organizer_avatar_url: string | null;
  } | null = null;
  if (recipientProfileId) {
    const { data: rp } = await admin.from("profiles")
      .select("display_name, artist_name, organizer_name, avatar_url, artist_avatar_url, organizer_avatar_url")
      .eq("profile_id", recipientProfileId).single();
    recipientProfile = rp ?? null;
  }

  return resolveCheerCardIdentity({
    recipientNameContext,
    recipient: recipientProfile ? {
      organizerName: recipientProfile.organizer_name,
      artistName: recipientProfile.artist_name,
      displayName: recipientProfile.display_name,
      organizerAvatarUrl: recipientProfile.organizer_avatar_url,
      artistAvatarUrl: recipientProfile.artist_avatar_url,
      avatarUrl: recipientProfile.avatar_url,
    } : null,
    productArtist: artistRaw ? {
      artistName: artistRaw.artist_name,
      displayName: artistRaw.display_name,
      avatarUrl: artistRaw.avatar_url,
    } : null,
  });
}

export async function generatePassBuffer(transactionId: string): Promise<Buffer> {
  const admin = createAdminClient();
  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select(`
      transaction_id, total_gross_amount, created_at, sequence_number_in_event, sender_name, sender_comment,
      product:products!product_id(name, artist_id, artist:profiles!artist_id(display_name, artist_name, avatar_url)),
      qr_config:qr_configs!qr_config_id(
        qr_config_id, event_id, image_url, recipient_profile_id, recipient_name_context,
        event:events!event_id(title)
      )
    `)
    .eq("transaction_id", transactionId)
    .eq("status", "completed")
    .single();

  if (txErr || !tx) throw Object.assign(new Error("Not found"), { status: 404 });

  const p12Base64 = process.env.APPLE_PASS_CERTIFICATE_P12_BASE64;
  const p12Password = process.env.APPLE_PASS_CERTIFICATE_PASSWORD ?? "";
  const passTypeId = process.env.APPLE_PASS_TYPE_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const serviceBaseUrl = process.env.APPLE_WALLET_SERVICE_URL;
  const authToken = process.env.WALLET_AUTH_SECRET;

  if (!p12Base64 || !passTypeId || !teamId) {
    throw Object.assign(new Error("Apple Wallet設定が不完全です"), { status: 500 });
  }

  const eventTitle = (tx.qr_config as any)?.event?.title ?? "";
  const amount = tx.total_gross_amount ?? 0;
  const serialNumber = tx.sequence_number_in_event ?? 0;
  const txDate = new Date(tx.created_at).toLocaleDateString("ja-JP");
  const qrConfigId = (tx.qr_config as any)?.qr_config_id as string | null | undefined;

  const { name: recipientName, avatarUrl: recipientAvatarUrl } = await resolveCheerPassIdentity(admin, tx as any);

  const { data: thanksData } = qrConfigId
    ? await admin.from("qr_config_thanks")
        .select("thanks_message, thanks_link_url, thanks_media_url, published_at")
        .eq("qr_config_id", qrConfigId)
        .maybeSingle()
    : { data: null };
  const thanksMessage = thanksData?.published_at ? thanksData.thanks_message : null;
  const thanksLinkUrl = thanksData?.published_at ? thanksData.thanks_link_url : null;
  const thanksMediaUrl = thanksData?.published_at ? thanksData.thanks_media_url : null;

  const passJson: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    serialNumber: tx.transaction_id,
    teamIdentifier: teamId,
    organizationName: "direct cheers",
    description: `Cheers to ${recipientName}`,
    backgroundColor: "rgb(2, 6, 23)",
    foregroundColor: "rgb(255, 255, 255)",
    labelColor: "rgb(148, 163, 184)",
    logoText: recipientName,
    storeCard: {
      secondaryFields: [
        { key: "event", label: "EVENT", value: eventTitle || "—" },
        { key: "amount", label: "CHEERS", value: `¥${amount.toLocaleString("ja-JP")}` },
      ],
      auxiliaryFields: [
        { key: "serial", label: "No.", value: `#${String(serialNumber).padStart(3, "0")}` },
        { key: "date", label: "DATE", value: txDate },
      ],
      backFields: [
        ...(tx.sender_name ? [{ key: "sender", label: "FROM", value: tx.sender_name }] : []),
        ...(tx.sender_comment ? [{ key: "message", label: "メッセージ", value: tx.sender_comment }] : []),
        ...(thanksMessage ? [{ key: "thanks", label: "アーティストより", value: thanksMessage }] : []),
        ...(thanksLinkUrl ? [{ key: "benefit", label: "特典リンク", value: thanksLinkUrl }] : []),
        ...(thanksMediaUrl ? [{ key: "media", label: "特典メディア", value: thanksMediaUrl }] : []),
        { key: "txid", label: "Transaction ID", value: tx.transaction_id },
        { key: "site", label: "direct cheers", value: "https://direct-cheers.com" },
      ],
    },
  };

  if (serviceBaseUrl && authToken) {
    passJson.webServiceURL = serviceBaseUrl;
    passJson.authenticationToken = authToken;
  }

  const logoPath = path.join(process.cwd(), "public", "logo-emblem.png");
  const logoBuffer = fs.readFileSync(logoPath);

  const qrImageUrl = (tx.qr_config as any)?.image_url as string | null | undefined;
  let strip2xRaw: Buffer;
  if (qrImageUrl) {
    const imgRes = await fetch(qrImageUrl, { cache: "no-store" });
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

  // ピンク背景 + 白ハートのフォールバックロゴ
  const pinkHeartSvg = (size: number) => Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="#ec4899"/>` +
    `<path fill="white" transform="translate(${size * 0.2},${size * 0.18}) scale(${(size * 0.6) / 24})" d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/>` +
    `</svg>`
  );

  const makeLogoBuffer = async (size: number): Promise<Buffer> => {
    if (recipientAvatarUrl) {
      try {
        const res = await fetch(recipientAvatarUrl, { cache: "no-store" });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          return await sharp(buf).resize(size, size, { fit: "cover", position: "centre" }).png().toBuffer();
        }
      } catch { /* フォールバックへ */ }
    }
    return await sharp(pinkHeartSvg(size)).png().toBuffer();
  };

  const [icon1x, icon2x, icon3x, logo1x, logo2x, strip1x, strip2x, strip3x] = await Promise.all([
    sharp(logoBuffer).resize(29, 29).png().toBuffer(),
    sharp(logoBuffer).resize(58, 58).png().toBuffer(),
    sharp(logoBuffer).resize(87, 87).png().toBuffer(),
    makeLogoBuffer(50),
    makeLogoBuffer(100),
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

  return pass.getAsBuffer() as unknown as Buffer;
}
