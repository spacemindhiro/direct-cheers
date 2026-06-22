'use client';

import {
  sanitizeStatementDescriptorSuffix,
  sanitizeStatementDescriptorSuffixKana,
  sanitizeStatementDescriptorSuffixKanji,
} from '@/lib/statement-descriptor';
import { Receipt, AlertTriangle } from 'lucide-react';

/**
 * この名前がチア決済時のカード利用明細にどう反映されるかをリアルタイムで見せる。
 * オーガナイザー/アーティストがこの名前を設定する際、それが客のカード明細に
 * 出ることを自覚してもらうための見える化。
 *
 * lib/statement-descriptor.ts は純粋関数（DB/Stripe呼び出し無し）なのでクライアント側で直接使う。
 */
export function StatementDescriptorPreview({ name }: { name: string }) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const ascii = sanitizeStatementDescriptorSuffix(trimmed);
  const kana = sanitizeStatementDescriptorSuffixKana(trimmed);
  const kanji = sanitizeStatementDescriptorSuffixKanji(trimmed);
  const allEmpty = !ascii && !kana && !kanji;

  return (
    <div className={`rounded-xl border px-4 py-3 space-y-2 ${allEmpty ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-700 bg-slate-950/40'}`}>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
        <Receipt size={11} className="text-pink-500" /> カード利用明細への表示プレビュー
      </p>
      {allEmpty ? (
        <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
          <AlertTriangle size={11} /> この名前は明細に反映されません。半角英数字または日本語を含めてください。
        </p>
      ) : (
        <div className="space-y-1 text-[11px]">
          <p className="text-slate-500">
            日本のカード会社：<span className="text-white font-bold">{kanji || kana || '(反映されません)'}</span>
          </p>
          <p className="text-slate-500">
            海外のカード会社：<span className="text-white font-bold">{ascii || '(反映されません)'}</span>
          </p>
        </div>
      )}
      <p className="text-[9px] text-slate-600">
        ※ お客様がこのイベントで決済した際、カードの利用明細にこの名前が表示されます。実際の表示形式はカード発行会社により異なります。
      </p>
    </div>
  );
}
