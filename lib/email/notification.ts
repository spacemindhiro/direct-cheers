/**
 * 承認・アクション要求が発生するすべてのイベントのメール通知
 * fire-and-forget で呼ぶこと（呼び出し元では try/catch でラップ）
 */
import { Resend } from "resend";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
const FROM = "Direct Cheers <noreply@direct-cheers.com>";

function resend() {
  return new Resend(process.env.RESEND_API_KEY);
}

// ---- 共通ラッパー ----

async function send(to: string | string[], subject: string, html: string) {
  const toList = Array.isArray(to) ? to : [to];
  if (toList.length === 0) return;
  await resend().emails.send({ from: FROM, to: toList, subject, html });
}

// ---- テンプレート共通パーツ ----

function layout(content: string) {
  return `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="background:#0f172a;color:#f1f5f9;font-family:sans-serif;padding:32px;margin:0">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155">
    <p style="color:#ec4899;font-weight:900;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 8px">Direct Cheers</p>
    ${content}
    <p style="color:#475569;font-size:11px;margin:32px 0 0">このメールはシステムから自動送信されています。返信はできません。</p>
  </div>
</body>
</html>`;
}

function eventBox(title: string, sub?: string) {
  return `
  <div style="background:#0f172a;border-radius:12px;padding:16px;margin:0 0 24px;border:1px solid #0f172a">
    <p style="color:#94a3b8;font-size:11px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.1em">イベント</p>
    <p style="color:#ffffff;font-size:16px;font-weight:900;margin:0">${title}</p>
    ${sub ? `<p style="color:#64748b;font-size:12px;margin:6px 0 0">${sub}</p>` : ""}
  </div>`;
}

function actionButton(href: string, label: string) {
  return `
  <a href="${href}" style="display:block;background:linear-gradient(135deg,#ec4899,#db2777);color:#ffffff;text-decoration:none;text-align:center;padding:14px;border-radius:12px;font-weight:900;font-size:14px;letter-spacing:0.1em;margin-bottom:24px">
    ${label}
  </a>`;
}

// ================================================================
// 1. イベント承認依頼 → エージェント / admin
// ================================================================
export async function sendApprovalRequestEmail(opts: {
  to: string | string[];
  eventId: string;
  eventTitle: string;
  organizerName: string;
}) {
  await send(
    opts.to,
    `【Direct Cheers】イベント承認依頼：${opts.eventTitle}`,
    layout(`
      <h1 style="color:#ffffff;font-size:20px;font-weight:900;margin:0 0 16px">イベントの承認依頼が届いています</h1>
      <p style="color:#94a3b8;font-size:14px;line-height:1.8;margin:0 0 20px">
        <strong style="color:#ffffff">${opts.organizerName}</strong> さんからイベントの開催承認依頼が届きました。
      </p>
      ${eventBox(opts.eventTitle, `主催者：${opts.organizerName}`)}
      ${actionButton(`${SITE_URL}/dashboard/events/${opts.eventId}`, "承認画面を開く")}
    `),
  );
}

// ================================================================
// 2. 出演依頼 → アーティスト
// ================================================================
export async function sendLineupInviteEmail(opts: {
  to: string;
  eventId: string;
  eventTitle: string;
  organizerName: string;
  artistName: string;
}) {
  await send(
    opts.to,
    `【Direct Cheers】出演依頼：${opts.eventTitle}`,
    layout(`
      <h1 style="color:#ffffff;font-size:20px;font-weight:900;margin:0 0 16px">出演依頼が届いています</h1>
      <p style="color:#94a3b8;font-size:14px;line-height:1.8;margin:0 0 20px">
        <strong style="color:#ffffff">${opts.organizerName}</strong> さんから出演依頼が届きました。
        ダッシュボードで内容を確認し、承諾または辞退をお願いします。
      </p>
      ${eventBox(opts.eventTitle, `主催者：${opts.organizerName}`)}
      ${actionButton(`${SITE_URL}/dashboard/events/${opts.eventId}`, "出演依頼を確認する")}
    `),
  );
}

// ================================================================
// 3. 口座審査依頼 → admin
// ================================================================
export async function sendConnectReviewRequestEmail(opts: {
  to: string | string[];
  applicantName: string;
  applicantRole: string;
  profileId: string;
}) {
  await send(
    opts.to,
    `【Direct Cheers】口座開設審査依頼：${opts.applicantName}`,
    layout(`
      <h1 style="color:#ffffff;font-size:20px;font-weight:900;margin:0 0 16px">口座開設審査待ちのユーザーがいます</h1>
      <p style="color:#94a3b8;font-size:14px;line-height:1.8;margin:0 0 20px">
        <strong style="color:#ffffff">${opts.applicantName}</strong>（${opts.applicantRole}）がStripe審査を通過しました。
        管理画面から口座開設審査を行ってください。
      </p>
      ${actionButton(`${SITE_URL}/dashboard/admin/connect-review/${opts.profileId}`, "審査画面を開く")}
    `),
  );
}

// ================================================================
// 4. エビデンス提出（精算承認依頼）→ admin
// ================================================================
export async function sendEvidenceSubmittedEmail(opts: {
  to: string | string[];
  eventId: string;
  eventTitle: string;
  organizerName: string;
}) {
  await send(
    opts.to,
    `【Direct Cheers】精算承認依頼：${opts.eventTitle}`,
    layout(`
      <h1 style="color:#ffffff;font-size:20px;font-weight:900;margin:0 0 16px">開催証跡が提出されました</h1>
      <p style="color:#94a3b8;font-size:14px;line-height:1.8;margin:0 0 20px">
        <strong style="color:#ffffff">${opts.organizerName}</strong> さんから開催証跡が提出されました。
        精算管理から内容を確認し、承認をお願いします。
      </p>
      ${eventBox(opts.eventTitle, `主催者：${opts.organizerName}`)}
      ${actionButton(`${SITE_URL}/dashboard/admin/settlements`, "精算管理を開く")}
    `),
  );
}

// ================================================================
// 5. エビデンス差戻し → オーガナイザー
// ================================================================
export async function sendEvidenceRejectedEmail(opts: {
  to: string;
  eventId: string;
  eventTitle: string;
  reason?: string;
}) {
  await send(
    opts.to,
    `【Direct Cheers】開催証跡の差戻し：${opts.eventTitle}`,
    layout(`
      <h1 style="color:#ffffff;font-size:20px;font-weight:900;margin:0 0 16px">開催証跡が差し戻されました</h1>
      <p style="color:#94a3b8;font-size:14px;line-height:1.8;margin:0 0 20px">
        下記イベントの開催証跡が差し戻されました。内容を確認のうえ再提出してください。
      </p>
      ${eventBox(opts.eventTitle)}
      ${opts.reason ? `<div style="background:#450a0a;border:1px solid #7f1d1d;border-radius:12px;padding:16px;margin:0 0 24px"><p style="color:#fca5a5;font-size:13px;margin:0">${opts.reason}</p></div>` : ""}
      ${actionButton(`${SITE_URL}/dashboard/events/${opts.eventId}`, "証跡を再提出する")}
    `),
  );
}

// ================================================================
// 6. イベント承認完了 → オーガナイザー
// ================================================================
export async function sendEventApprovedEmail(opts: {
  to: string;
  eventId: string;
  eventTitle: string;
}) {
  await send(
    opts.to,
    `【Direct Cheers】イベントが承認されました：${opts.eventTitle}`,
    layout(`
      <h1 style="color:#ffffff;font-size:20px;font-weight:900;margin:0 0 16px">イベントが承認されました</h1>
      <p style="color:#94a3b8;font-size:14px;line-height:1.8;margin:0 0 20px">
        おめでとうございます！エージェントにイベントが承認され、公開されました。
      </p>
      ${eventBox(opts.eventTitle)}
      ${actionButton(`${SITE_URL}/dashboard/events/${opts.eventId}`, "イベントを確認する")}
    `),
  );
}

// ================================================================
// 7. イベント中止申請 → エージェント / admin
// ================================================================
export async function sendCancellationRequestEmail(opts: {
  to: string | string[];
  eventId: string;
  eventTitle: string;
  organizerName: string;
}) {
  await send(
    opts.to,
    `【Direct Cheers】イベント中止申請：${opts.eventTitle}`,
    layout(`
      <h1 style="color:#ffffff;font-size:20px;font-weight:900;margin:0 0 16px">イベントの中止申請が届いています</h1>
      <p style="color:#94a3b8;font-size:14px;line-height:1.8;margin:0 0 20px">
        <strong style="color:#ffffff">${opts.organizerName}</strong> さんからイベントの中止申請が届きました。
        内容を確認し、承認または却下をお願いします。
      </p>
      ${eventBox(opts.eventTitle, `主催者：${opts.organizerName}`)}
      ${actionButton(`${SITE_URL}/dashboard/events/${opts.eventId}`, "申請内容を確認する")}
    `),
  );
}

// ================================================================
// 8. 出演依頼への回答（承諾 / 辞退）→ オーガナイザー
// ================================================================
export async function sendLineupResponseEmail(opts: {
  to: string;
  eventId: string;
  eventTitle: string;
  artistName: string;
  accepted: boolean;
}) {
  const subject = opts.accepted
    ? `【Direct Cheers】出演依頼が承諾されました：${opts.artistName}`
    : `【Direct Cheers】出演依頼が辞退されました：${opts.artistName}`;

  await send(
    opts.to,
    subject,
    layout(`
      <h1 style="color:#ffffff;font-size:20px;font-weight:900;margin:0 0 16px">
        ${opts.accepted ? "出演依頼が承諾されました" : "出演依頼が辞退されました"}
      </h1>
      <p style="color:#94a3b8;font-size:14px;line-height:1.8;margin:0 0 20px">
        <strong style="color:#ffffff">${opts.artistName}</strong> さんが出演依頼に
        <strong style="color:${opts.accepted ? "#34d399" : "#f87171"}">${opts.accepted ? "承諾" : "辞退"}</strong>
        しました。
      </p>
      ${eventBox(opts.eventTitle)}
      ${actionButton(`${SITE_URL}/dashboard/events/${opts.eventId}`, "イベントを確認する")}
    `),
  );
}
