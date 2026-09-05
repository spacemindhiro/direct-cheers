import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * 一覧画面共通のページャ。
 * ページ状態はURLクエリで持つ（クライアントstateだと詳細画面から戻った際に
 * 1ページ目へリセットされてしまうため）。
 */
export function ListPager({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  /** 指定ページへのリンク先を返す。呼び出し側で tab 等の他パラメータを保持する。 */
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const base =
    "flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-xs font-black uppercase tracking-widest transition-all";
  const disabled = `${base} border-slate-900 text-slate-700 cursor-default`;
  const enabled = `${base} border-slate-800 text-slate-300 hover:border-pink-500/40 hover:text-white`;

  return (
    <div className="flex items-center justify-between">
      {page <= 1 ? (
        <span className={disabled}><ChevronLeft size={14} /> 前へ</span>
      ) : (
        <Link href={hrefFor(page - 1)} scroll={false} className={enabled}>
          <ChevronLeft size={14} /> 前へ
        </Link>
      )}

      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
        {page} / {totalPages}
      </span>

      {page >= totalPages ? (
        <span className={disabled}>次へ <ChevronRight size={14} /></span>
      ) : (
        <Link href={hrefFor(page + 1)} scroll={false} className={enabled}>
          次へ <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );
}
