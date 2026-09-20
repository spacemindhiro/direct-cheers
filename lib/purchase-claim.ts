import { Resend } from "resend";
import type { createAdminClient } from "@/lib/supabase/admin";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

// 再送の連打抑止（同一メールへの発行間隔）
export const CLAIM_RESEND_INTERVAL_SEC = 60;

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * 決済後アカウント作成用のワンタイムトークンを発行し、メールに載せるURLを返す。
 *
 * 「アカウントは、そのメールに届いたリンクを踏んだ人しか作れない」を成立させる
 * ための入口。/auth/claim/<token> がこのトークンを検証し、サーバー内で Supabase の
 * 短命リンクを発行→即検証してセッションを張る（詳細はそちらのコメント）。
 *
 * トークン発行に失敗してもレシートメール自体は止めたくないので、その場合は
 * 通常のログイン導線（メール事前入力）へのURLを返してログに残す。
 */
export async function issuePurchaseClaimUrl(
  admin: AdminClient,
  params: { email: string; transactionId: string | null; redirectPath: string },
): Promise<string> {
  const { email, transactionId, redirectPath } = params;
  const { data, error } = await admin
    .from("purchase_claim_tokens")
    .insert({ email, transaction_id: transactionId, redirect_path: redirectPath })
    .select("token")
    .single();

  if (error || !data?.token) {
    console.error(`[purchase-claim] トークン発行失敗: ${error?.message ?? "no token"}`);
    return `${SITE_URL}/auth/login?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirectPath)}`;
  }
  return buildClaimUrl(data.token);
}

export function buildClaimUrl(token: string): string {
  return `${SITE_URL}/auth/claim/${token}`;
}

/** 商品種別に応じた claim 完了後の遷移先 */
export function claimRedirectPathFor(productType: string | null | undefined): string {
  return productType === "entrance" ? "/tickets" : "/dashboard/collection";
}

/**
 * アカウント作成ボタンの直下に置く規約同意の注記。
 * 以前はサンクス画面のパスキー登録ボタンに出していた（5c5b47a）が、
 * 新規アカウントが作られる瞬間がメールのリンククリックに移ったため、
 * 注記もボタンと同じメール内に置く。
 */
export function claimTermsNoticeHtml(): string {
  return `
        <p style="color:#475569;font-size:11px;line-height:1.7;margin:12px 0 0">
          ボタンからアカウントを作成すると
          <a href="${SITE_URL}/terms" style="color:#94a3b8">利用規約</a>および
          <a href="${SITE_URL}/privacy" style="color:#94a3b8">プライバシーポリシー</a>に同意したものとみなします。
        </p>`;
}

/**
 * サンクス画面の「確認メールを再送」用。レシート本体は再送せず、
 * アカウント作成リンクだけの短いメールを送る。
 */
export async function sendClaimLinkEmail(params: { to: string; claimUrl: string }): Promise<void> {
  const { to, claimUrl } = params;
  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: "Direct Cheers <noreply@direct-cheers.com>",
    to,
    subject: "【Direct Cheers】アカウント作成のご案内",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#f1f5f9;border-radius:16px">
        <p style="color:#ec4899;font-size:10px;font-weight:900;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 8px">Direct Cheers</p>
        <p style="font-size:22px;font-weight:900;margin:0 0 20px">アカウント作成のご案内</p>

        <p style="color:#64748b;font-size:13px;line-height:1.8;margin:0 0 20px">
          下のボタンからアカウントを作成すると、応援・購入の履歴をいつでも確認できます。<br>
          顔認証・指紋認証（パスキー）を登録すれば、次回から1タップでログインできます。
        </p>

        <a href="${claimUrl}"
          style="display:inline-block;padding:14px 28px;background:#ec4899;color:#fff;text-decoration:none;border-radius:12px;font-weight:900;font-size:14px">
          アカウントを作成する
        </a>
        ${claimTermsNoticeHtml()}

        <p style="color:#334155;font-size:11px;margin:24px 0 0">
          このリンクは30日間・1回のみ有効です。<br>
          このメールに心当たりがない場合は、そのまま破棄してください。
        </p>
      </div>
    `,
  });
}
