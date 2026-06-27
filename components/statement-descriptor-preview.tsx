'use client';

import {
  sanitizeStatementDescriptorSuffix,
  sanitizeStatementDescriptorSuffixKanji,
  combineDescriptorPreview,
  PLATFORM_PREFIX,
  STATEMENT_DESCRIPTOR_TOTAL_MAX,
} from '@/lib/statement-descriptor';
import { Receipt, Info } from 'lucide-react';

type Props = {
  /**
   * このプレビューが表す名義。
   * - 'artist': 演者名義の決済（recipient_name_context='artist'） → 演者名がsuffixになる。
   * - 'organizer': 主催者名義の決済（recipient_name_context='organizer'、入場券も同様） → 主催者名がsuffixになる。
   */
  role: 'artist' | 'organizer';
  /** 入力中の名前（artist_name または organizer_name） */
  name: string;
};

/**
 * 構成要素は「固定ベース（"DC"）」+「このフィールドの名前（suffix）」の2つだけ。
 * 事業者名から作る別のベース表記（オンボーディング/bank-setup画面の専用機能）は、
 * このプレビューとは無関係な別レイヤーなので一切混ぜない。
 */
export function StatementDescriptorPreview({ role, name }: Props) {
  const isArtistRole = role === 'artist';
  const trimmedName = name.trim();
  const isPlaceholder = !trimmedName;
  const suffixSourceRaw = trimmedName || (isArtistRole ? 'DJ TARO' : 'TARO EVENTS');
  const suffixLabel = isArtistRole ? '演者名' : '主催者名';

  const suffixAscii = sanitizeStatementDescriptorSuffix(suffixSourceRaw, 19);
  const suffixKanji = sanitizeStatementDescriptorSuffixKanji(suffixSourceRaw, 17);

  const { combined: combinedKanji } = combineDescriptorPreview(
    PLATFORM_PREFIX, suffixKanji, STATEMENT_DESCRIPTOR_TOTAL_MAX.kanji,
  );
  const { combined: combinedAscii } = combineDescriptorPreview(
    PLATFORM_PREFIX, suffixAscii, STATEMENT_DESCRIPTOR_TOTAL_MAX.ascii,
  );

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-3 space-y-2">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
        <Receipt size={11} className="text-pink-500" /> カード利用明細への表示プレビュー（{suffixLabel}）
      </p>

      <div className="space-y-1 text-[11px]">
        <p className="text-slate-500">
          日本のカード会社：<span className="text-white font-bold">{combinedKanji}</span>
        </p>
        <p className="text-slate-500">
          海外のカード会社：<span className="text-white font-bold">{combinedAscii}</span>
        </p>
      </div>

      {isPlaceholder && (
        <p className="text-[10px] text-slate-600 flex items-start gap-1.5">
          <Info size={10} className="mt-0.5 shrink-0" />
          <span>名前を入力すると、実際にこの欄に反映される表示に更新されます。</span>
        </p>
      )}

      <p className="text-[9px] text-slate-600">
        ※ 先頭の「DC」部分は不正な明細表記によるチャージバックを防ぐためシステムが固定しています。
        実際の表示形式はカード発行会社により異なります。
      </p>
    </div>
  );
}
