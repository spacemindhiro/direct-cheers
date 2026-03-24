import React from 'react';

export default function LawPage() {
  const rowStyle = "border-b border-slate-800 py-4 flex flex-col md:flex-row";
  const labelStyle = "md:w-1/3 font-bold text-slate-400 text-sm mb-1 md:mb-0";
  const contentStyle = "md:w-2/3 text-white text-sm";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8 md:p-24">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-black mb-12 italic border-l-4 border-pink-500 pl-4 uppercase">特定商取引法に基づく表記</h1>
        
        <div className="space-y-1">
          <div className={rowStyle}><div className={labelStyle}>販売業者</div><div className={contentStyle}>[PMのご氏名 または 屋号]</div></div>
          <div className={rowStyle}><div className={labelStyle}>代表責任者</div><div className={contentStyle}>[PMのご氏名]</div></div>
          <div className={rowStyle}><div className={labelStyle}>所在地</div><div className={contentStyle}>[郵便番号・住所]</div></div>
          <div className={rowStyle}><div className={labelStyle}>電話番号</div><div className={contentStyle}>[電話番号] ※Stripe登録と一致させる</div></div>
          <div className={rowStyle}><div className={labelStyle}>メールアドレス</div><div className={contentStyle}>[info@yourdomain.com 等]</div></div>
          <div className={rowStyle}><div className={labelStyle}>販売価格</div><div className={contentStyle}>各商品の購入ページに表示される価格（税込）</div></div>
          <div className={rowStyle}><div className={labelStyle}>商品代金以外の必要料金</div><div className={contentStyle}>なし（インターネット接続費用は別途お客様負担）</div></div>
          <div className={rowStyle}><div className={labelStyle}>支払方法</div><div className={contentStyle}>クレジットカード決済</div></div>
          <div className={rowStyle}><div className={labelStyle}>商品の引渡時期</div><div className={contentStyle}>決済完了後、直ちにブラウザ上のマイページにて閲覧可能な状態になります。</div></div>
          <div className={rowStyle}><div className={labelStyle}>返品・交換・キャンセル</div><div className={contentStyle}>デジタルコンテンツの特性上、決済完了後の返品・返金・キャンセルには応じられません。</div></div>
        </div>

        <div className="mt-12">
          <a href="/" className="text-pink-500 hover:underline">← トップページに戻る</a>
        </div>
      </div>
    </div>
  );
}