"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export type TxGroup = {
  qr_config_id: string;
  qr_label: string;
  total: number;
  transactions: { transaction_id: string; amount: number; created_at: string; sender_name: string | null }[];
};

export type DistributionRow = {
  profile_id: string;
  display_name: string | null;
  amount: number;
};

type Props = {
  gross: number;
  net: number;
  netRateLabel: string;
  txGroups: TxGroup[];
  distributionRows: DistributionRow[];
};

export function SettlementDetails({ gross, net, netRateLabel, txGroups, distributionRows }: Props) {
  const [showTx, setShowTx] = useState(false);
  const [showDist, setShowDist] = useState(false);

  return (
    <div className="space-y-2">
      {/* 総売上 */}
      <div>
        <button
          type="button"
          onClick={() => setShowTx((v) => !v)}
          className="flex items-center justify-between w-full bg-slate-800/60 rounded-xl px-4 py-2 hover:bg-slate-800 transition-colors text-left"
        >
          <div>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest">総売上</p>
            <p className="text-lg font-black text-white italic">¥{gross.toLocaleString()}</p>
          </div>
          {showTx ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </button>

        {showTx && (
          <div className="mt-1 bg-slate-800/30 rounded-xl divide-y divide-slate-800 overflow-hidden">
            {txGroups.length === 0 ? (
              <p className="text-xs text-slate-600 px-4 py-3">売上データなし</p>
            ) : txGroups.map((g) => (
              <div key={g.qr_config_id} className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black text-slate-300">{g.qr_label || "QRコード"}</p>
                  <p className="text-xs font-black text-white">¥{g.total.toLocaleString()}</p>
                </div>
                <div className="space-y-1 pl-2 border-l border-slate-700">
                  {g.transactions.map((tx) => (
                    <div key={tx.transaction_id} className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>
                        {new Date(tx.created_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {tx.sender_name ? ` · ${tx.sender_name}` : ""}
                      </span>
                      <span>¥{tx.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 配分額 */}
      <div>
        <button
          type="button"
          onClick={() => setShowDist((v) => !v)}
          className="flex items-center justify-between w-full bg-slate-800/60 rounded-xl px-4 py-2 hover:bg-slate-800 transition-colors text-left"
        >
          <div>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest">配分額 ({netRateLabel})</p>
            <p className="text-lg font-black text-emerald-400 italic">¥{net.toLocaleString()}</p>
          </div>
          {showDist ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </button>

        {showDist && (
          <div className="mt-1 bg-slate-800/30 rounded-xl divide-y divide-slate-800 overflow-hidden">
            {distributionRows.length === 0 ? (
              <p className="text-xs text-slate-600 px-4 py-3">配分先データなし</p>
            ) : distributionRows.map((row) => (
              <div key={row.profile_id} className="flex items-center justify-between px-4 py-2.5">
                <p className="text-xs font-bold text-slate-300">{row.display_name ?? "—"}</p>
                <p className="text-xs font-black text-emerald-400">¥{row.amount.toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
