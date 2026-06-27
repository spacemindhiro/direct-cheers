"use client";

import type { MessageRow } from "@/app/[locale]/dashboard/events/[eventId]/settlement/page";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

type Props = {
  rows: MessageRow[];
  showRecipient: boolean;
};

export function MessageListSection({ rows, showRecipient }: Props) {
  return (
    <div className="mb-8 print:mb-6">
      <h2 className="text-sm font-black text-slate-400 tracking-widest uppercase mb-4 print:text-slate-600">
        ✉️ 受信メッセージ一覧（メッセージプラン）
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600 print:text-slate-400">メッセージプランの決済はありません。</p>
      ) : (
        <div className="rounded-2xl border border-slate-800 overflow-hidden print:border-slate-300">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 print:bg-slate-100">
                <th className="text-left px-4 py-3 text-xs font-black text-slate-500 print:text-slate-600">決済日時</th>
                <th className="text-left px-4 py-3 text-xs font-black text-slate-500 print:text-slate-600">送信者名</th>
                {showRecipient && <th className="text-left px-4 py-3 text-xs font-black text-slate-500 print:text-slate-600">宛先</th>}
                <th className="text-left px-4 py-3 text-xs font-black text-slate-500 print:text-slate-600">メッセージ</th>
                <th className="text-right px-4 py-3 text-xs font-black text-slate-500 print:text-slate-600">チア金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 print:divide-slate-200">
              {rows.map((row, i) => (
                <tr key={row.transaction_id} className={i % 2 !== 0 ? "bg-slate-900/30 print:bg-slate-50" : ""}>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap print:text-slate-600">
                    {new Date(row.created_at).toLocaleString("ja-JP", {
                      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit",
                      day: "2-digit", hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300 print:text-slate-700">
                    {row.sender_name ?? "匿名"}
                  </td>
                  {showRecipient && (
                    <td className="px-4 py-3 text-sm text-slate-300 print:text-slate-700">
                      {row.recipient_name ?? "全体"}
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-slate-200 max-w-xs print:text-slate-800">
                    {row.sender_comment ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-emerald-400 text-right whitespace-nowrap print:text-emerald-700">
                    {yen(row.total_gross_amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
