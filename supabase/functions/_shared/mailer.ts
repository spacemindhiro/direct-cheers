/**
 * _shared/mailer.ts
 * Resend を使ったメール送信ユーティリティ（Edge Function 共有）
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_ADDRESS   = Deno.env.get("EMAIL_FROM") ?? "noreply@direct-cheers.jp";

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail(opts: MailOptions): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn("[mailer] RESEND_API_KEY not set, skipping email");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[mailer] Resend error:", res.status, text);
  }
}

// ---- メールテンプレート ----

export function cardErrorEmail(opts: {
  eventTitle: string;
  productName: string;
  errorMessage: string;
  repurchaseUrl: string;
}) {
  return `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><title>チケット無効のお知らせ</title></head>
<body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155;">
    <p style="color:#f472b6;font-weight:900;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 8px">
      Direct Cheers
    </p>
    <h1 style="color:#ffffff;font-size:22px;font-weight:900;margin:0 0 24px">
      カード無効のため、チケットがキャンセルされました
    </h1>
    <p style="color:#94a3b8;margin:0 0 16px">
      以下のチケットに登録されたカードの状態が無効と確認されたため、チケットを自動キャンセルしました。
    </p>
    <div style="background:#0f172a;border-radius:12px;padding:16px;margin:0 0 24px;border:1px solid #1e293b;">
      <p style="color:#cbd5e1;font-size:14px;font-weight:700;margin:0 0 4px">${opts.eventTitle}</p>
      <p style="color:#64748b;font-size:12px;margin:0">${opts.productName}</p>
    </div>
    <div style="background:#450a0a;border:1px solid #7f1d1d;border-radius:12px;padding:16px;margin:0 0 24px;">
      <p style="color:#fca5a5;font-size:12px;font-weight:700;margin:0 0 4px">カードエラーの内容</p>
      <p style="color:#fca5a5;font-size:12px;margin:0">${opts.errorMessage}</p>
    </div>
    <p style="color:#94a3b8;font-size:13px;margin:0 0 24px">
      有効なカードで新しくチケットをご購入ください。キャンセルされたチケットは復活しません。
    </p>
    <a href="${opts.repurchaseUrl}"
       style="display:block;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#ffffff;text-decoration:none;text-align:center;padding:14px;border-radius:12px;font-weight:900;font-size:14px;letter-spacing:0.1em;margin:0 0 24px">
      別のカードで購入する
    </a>
    <p style="color:#475569;font-size:11px;margin:0">
      このメールはシステムから自動送信されています。返信はできません。
    </p>
  </div>
</body>
</html>`;
}

export function chargeSuccessEmail(opts: {
  eventTitle: string;
  productName: string;
  amount: number;
  ticketUrl: string;
}) {
  return `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><title>チケット決済完了</title></head>
<body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155;">
    <p style="color:#818cf8;font-weight:900;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 8px">
      Direct Cheers
    </p>
    <h1 style="color:#ffffff;font-size:22px;font-weight:900;margin:0 0 24px">
      🎟️ チケット決済が完了しました
    </h1>
    <div style="background:#0f172a;border-radius:12px;padding:16px;margin:0 0 24px;border:1px solid #1e293b;">
      <p style="color:#cbd5e1;font-size:14px;font-weight:700;margin:0 0 4px">${opts.eventTitle}</p>
      <p style="color:#64748b;font-size:12px;margin:0 0 12px">${opts.productName}</p>
      <p style="color:#818cf8;font-size:24px;font-weight:900;font-style:italic;margin:0">
        ¥${opts.amount.toLocaleString()}
      </p>
    </div>
    <a href="${opts.ticketUrl}"
       style="display:block;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#ffffff;text-decoration:none;text-align:center;padding:14px;border-radius:12px;font-weight:900;font-size:14px;letter-spacing:0.1em;margin:0 0 24px">
      チケットを確認する
    </a>
    <p style="color:#475569;font-size:11px;margin:0">
      このメールはシステムから自動送信されています。
    </p>
  </div>
</body>
</html>`;
}

export function chargeFailedEmail(opts: {
  eventTitle: string;
  productName: string;
  errorMessage: string;
}) {
  return `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><title>チケット決済失敗のお知らせ</title></head>
<body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155;">
    <p style="color:#f472b6;font-weight:900;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 8px">
      Direct Cheers
    </p>
    <h1 style="color:#ffffff;font-size:22px;font-weight:900;margin:0 0 24px">
      決済失敗のため、チケットがキャンセルされました
    </h1>
    <p style="color:#94a3b8;margin:0 0 16px">
      以下のチケットの自動決済に失敗したため、チケットを自動キャンセルしました。
    </p>
    <div style="background:#0f172a;border-radius:12px;padding:16px;margin:0 0 24px;border:1px solid #1e293b;">
      <p style="color:#cbd5e1;font-size:14px;font-weight:700;margin:0 0 4px">${opts.eventTitle}</p>
      <p style="color:#64748b;font-size:12px;margin:0">${opts.productName}</p>
    </div>
    <div style="background:#450a0a;border:1px solid #7f1d1d;border-radius:12px;padding:16px;margin:0 0 24px;">
      <p style="color:#fca5a5;font-size:12px;margin:0">${opts.errorMessage}</p>
    </div>
    <p style="color:#94a3b8;font-size:13px;margin:0 0 24px">
      このチケットは無効になりました。別のカードで新しくチケットをご購入ください。一度無効になったチケットは復活しません。
    </p>
    <p style="color:#475569;font-size:11px;margin:0">
      このメールはシステムから自動送信されています。
    </p>
  </div>
</body>
</html>`;
}
