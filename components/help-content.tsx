"use client";

import { useState } from "react";
import {
  HelpCircle,
  KeyRound,
  Heart,
  Ticket,
  Layers,
  UserCog,
  ChevronDown,
  Mail,
  CalendarPlus,
  QrCode,
  ScanLine,
  FileCheck2,
  Landmark,
  Wallet,
  TrendingUp,
  UserPlus,
  Mic2,
  CheckCircle2,
  BarChart2,
  XCircle,
  Zap,
} from "lucide-react";

export type HelpRole = "user" | "organizer" | "artist";

const TABS: { id: HelpRole; label: string }[] = [
  { id: "user", label: "一般ユーザー" },
  { id: "artist", label: "アーティスト" },
  { id: "organizer", label: "オーガナイザー" },
];

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-pink-500/10 rounded-xl flex items-center justify-center border border-pink-500/20 shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-sm font-black text-white">{title}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="text-xs text-slate-300 leading-relaxed space-y-2 pl-12">
        {children}
      </div>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-xs font-bold text-white">{q}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <p className="px-4 pb-3 text-[11px] text-slate-400 leading-relaxed">{a}</p>
      )}
    </div>
  );
}

function UserGuide() {
  return (
    <div className="space-y-4">
      <Section
        icon={<Zap size={16} className="text-pink-500" />}
        title="① 支払い方法の準備（いちばん大事）"
        subtitle="Payment Speed"
      >
        <p>決済をスムーズに行うために、以下のいずれかを最初に設定しておくことを強くおすすめします。ダッシュボードのトップにも同じ案内が表示されます。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>
            <b>Apple Pay</b>（iPhone）: 「ウォレット」アプリでカードを登録しておくと、決済画面でワンタッチで支払えます。ただし
            <b>LINEなどアプリ内ブラウザではApple Payは使えません</b>
          </li>
          <li><b>Google Pay</b>（Android）: 「Google ウォレット」アプリでカードを登録しておくと同様にワンタッチで支払えます</li>
          <li><b>Stripe Link</b>: ダッシュボードの「Stripe Linkにカードを登録する」（または「/link-setup」）からメールアドレスとカードを登録すると、次回からはメールアドレスの入力だけでどんな環境でも確実にワンタッチ決済できます。<b>Apple Pay/Google Payが使えない場面のバックアップとして特におすすめです</b></li>
          <li>いずれも未設定の場合はカード番号の手入力でも決済できますが、毎回入力が必要でイベント当日は時間がかかります</li>
        </ul>
      </Section>

      <Section
        icon={<KeyRound size={16} className="text-pink-500" />}
        title="② 会員登録・ログイン"
        subtitle="Member Access"
      >
        <p>専用の会員登録は不要です。ログイン画面でメールアドレスを入力するだけで、初めての方は自動的にアカウントが作成されます。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>「ログインリンクを送る」を押すとメールが届くので、本文中のリンクをタップするとログインできます（パスコードの入力は不要です）</li>
          <li>Googleアカウントでもログインできます</li>
          <li>初回ログイン後に案内される「1秒でログイン」でパスキー（顔認証・指紋認証）を登録すると、次回から入力なしでログインできます（あとで設定も可能）</li>
        </ul>
      </Section>

      <Section
        icon={<Heart size={16} className="text-pink-500" />}
        title="③ チアを送る・チケットを購入する"
        subtitle="Send Cheers"
      >
        <p>会場やSNS、告知物にあるQRコードを読み取ると、アーティストやイベントの専用ページが開きます。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>スライダーで金額を選び（イベントによっては人数・杯数の指定も）、メールアドレスを入力します</li>
          <li>「¥○○ を応援する」（チケットの場合は「購入する」）ボタンを押すと決済に進みます</li>
          <li>Apple Pay・Google Pay・クレジットカードに対応しています</li>
          <li>ボタンを押した時点で入力したメールアドレスでアカウントが自動作成されるため、事前の会員登録は不要です</li>
        </ul>
      </Section>

      <Section
        icon={<Ticket size={16} className="text-pink-500" />}
        title="④ マイチケットの使い方"
        subtitle="Wallet"
      >
        <p>ダッシュボードの「マイチケット」から、購入したチケットをQRコード付きのデジタルチケットで確認できます。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>会場の入口でスタッフにこのQRコードを見せるだけで入場できます（印刷は不要です）</li>
          <li>入場が完了すると券面が「入場済み」の表示に変わります</li>
          <li>「Apple Walletに追加」ボタンで、iPhoneのWalletアプリからも表示できます</li>
          <li>事前確定型（5日前確定）のチケットのみ、イベント5日前まで「予約をキャンセル」が可能です</li>
        </ul>
      </Section>

      <Section
        icon={<Layers size={16} className="text-pink-500" />}
        title="⑤ カードコレクション・応援履歴"
        subtitle="Collection"
      >
        <p>ダッシュボードの「Cheers History」で、これまで応援した金額やコメントの履歴を確認できます。</p>
        <p>「カードコレクション」では、応援したアーティストのカードをまとめて振り返れます。</p>
      </Section>

      <Section
        icon={<UserCog size={16} className="text-pink-500" />}
        title="⑥ アカウント設定"
        subtitle="Account"
      >
        <ul className="list-disc pl-4 space-y-1">
          <li>「アカウント管理」の「応援履歴を統合」から、うっかり別のメールアドレスで応援してしまった履歴を今のアカウントにまとめられます</li>
          <li>パスキーに対応していない端末のために、「アカウント管理」からパスワード（8文字以上）を設定できます</li>
          <li>「パスキー管理」から、登録済みデバイスの確認・名称変更・削除・追加ができます</li>
        </ul>
      </Section>

      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20 shrink-0">
            <HelpCircle size={16} className="text-indigo-400" />
          </div>
          <p className="text-sm font-black text-white">よくある質問</p>
        </div>
        <div className="space-y-2">
          <Faq
            q="Apple Payのボタンが出てきません"
            a="LINEなどアプリ内ブラウザで開いている場合、その仕様上Apple Payは使用できません。画面右上などのメニューから「他のブラウザで開く」を選び、SafariやChromeなど通常のブラウザで開き直してください。"
          />
          <Faq
            q="ログインリンクのメールが届きません"
            a="迷惑メールフォルダをご確認ください。それでも届かない場合は、ログイン画面から再度メールアドレスを入力して送信し直してください。"
          />
          <Faq
            q="複数のメールアドレスで応援してしまいました"
            a="「アカウント管理」の「応援履歴を統合」から、まとめたいメールアドレスを入力して確認メールを送ると、履歴を1つのアカウントにまとめられます。"
          />
          <Faq
            q="購入したチケットをキャンセルしたい"
            a="事前確定型（5日前確定）のチケットのみ、マイチケット画面からイベント5日前までキャンセルできます。それ以外のチケットタイプは購入後のキャンセルに対応していません。"
          />
        </div>
      </div>
    </div>
  );
}

function ArtistGuide() {
  return (
    <div className="space-y-4">
      <Section
        icon={<Mic2 size={16} className="text-pink-500" />}
        title="① プロフィール設定"
        subtitle="Profile"
      >
        <p>「プロフィール」の基本情報（表示名・アバター）に加えて、アーティスト専用の項目を設定できます。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>「アーティスト名（DJ名）」: ラインナップやWallet、お客様のカード利用明細にも表示されます。未入力なら表示名が使われます</li>
          <li>「アーティスト用の画像」: 演者名義のチアで使われるカード画像（未設定なら基本のアバター画像を使用）</li>
          <li>「海外カード明細用の英字表記」: 海外発行カードでは漢字部分が表示されないため、未入力の場合はアーティスト名から自動生成されます</li>
          <li>「クレジット表記」「所属団体」「出演ジャンル / 演目」「紹介文」も任意で設定できます</li>
          <li>入力後は「保存する」を押してください</li>
        </ul>
      </Section>

      <Section
        icon={<CheckCircle2 size={16} className="text-pink-500" />}
        title="② 出演依頼を受ける"
        subtitle="Lineup Invitations"
      >
        <p>オーガナイザーからイベントへの出演依頼が届くと、ダッシュボードホームに「出演（依頼 N件）」のカードが表示されます。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>カードにはイベント名・会場・日付、依頼元のオーガナイザー名、メッセージ（あれば）が表示されます（ステータス「出演依頼 — 承認待ち」）</li>
          <li>「承認」を押すと「出演確定」バッジに変わり、そのイベントの詳細ページに遷移できるようになります</li>
          <li>「辞退」を押すとその場で依頼が取り下げられます</li>
          <li>出演依頼をきっかけに、オーガナイザーとのメッセージ画面（DM）が自動的に作られます</li>
        </ul>
      </Section>

      <Section
        icon={<Heart size={16} className="text-pink-500" />}
        title="③ チアの受け取り方"
        subtitle="Cheers Card"
      >
        <p>アーティスト個人が常時使える「マイQR」はありません。チア用のQRコードは、出演するイベントごとにオーガナイザーが発行し、そこに配分先の1人としてあなたが登録される仕組みです。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>出演確定したイベントのQR詳細画面で、「✦ Cheersカード」（自分が受取人の場合はカード画像を変更可能）と「✦ 配分設定」（自分の配分比率、閲覧のみ）を確認できます</li>
          <li>金額のレンジや商品タイプ、QRコード自体の作成・編集はオーガナイザーが行います</li>
        </ul>
      </Section>

      <Section
        icon={<TrendingUp size={16} className="text-pink-500" />}
        title="④ 収益確認"
        subtitle="Income"
      >
        <p>「収支レポート」（Income）で、確定申告・青色申告記帳用の月次内訳を確認できます。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>「ダイレクト着金」カードに、着金純額・取消額（あれば）・未出金Stripe残高が表示されます</li>
          <li>集計は着金日基準（現金主義）です。実際にStripe Connect口座へ送金された日を収入計上日としており、決済確定日や出金申請日とは異なります。未出金の残高は収入額に含まれません</li>
          <li>「CSVダウンロード」で月次データを書き出せます</li>
        </ul>
      </Section>

      <Section
        icon={<Wallet size={16} className="text-pink-500" />}
        title="⑤ 出金"
        subtitle="Payout"
      >
        <p>「出金管理」（Payout）で、残高を「出金可能」「保留中」「凍結中」の3区分で確認し、出金申請ができます。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>売上は決済が行われてから2週間（14日）後に出金可能になります。振込手数料として¥500が差し引かれます</li>
          <li>出金可能額がある場合のみ、スライダーで金額を指定して「¥○○ を出金する」ボタンから申請できます</li>
          <li>チャージバック（クレジットカード会社への異議申し立て）が発生すると、該当額が「凍結中」に区分され、出金が一時停止されます。回数は画面上部に表示されます</li>
        </ul>
      </Section>

      <Section
        icon={<Landmark size={16} className="text-pink-500" />}
        title="⑥ 口座登録"
        subtitle="Bank Setup"
      >
        <p>「プロフィール」の「口座登録・本人確認を始める」から、Stripe Connectでの本人確認・口座登録に進めます。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>種別選択・氏名・生年月日・住所・事業情報の5ステップに沿って入力し、最後に「Stripeで口座登録」からStripe側の画面で本人確認と口座登録を行います</li>
          <li>Stripe側の手続き完了後は「口座開設審査中」と表示され、オーナー（運営）による最終承認をお待ちいただく形になります。承認されると「審査完了 — 受取可能」に変わります</li>
          <li>口座登録が未完了の間にイベントの精算が行われても、あなたへの送金が失われることはありません。口座登録が完了するまで送金がいったん保留され、審査完了後に自動的に送金されます</li>
        </ul>
      </Section>

      <Section
        icon={<BarChart2 size={16} className="text-pink-500" />}
        title="⑦ 統計"
        subtitle="Statistics"
      >
        <p>ヘッダーの統計アイコンから、これまで送ったチアの累計に加えて、これまで受け取ったチアの件数・総流通額・手数料控除後の受取額（概算）を確認できます。</p>
      </Section>

      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20 shrink-0">
            <HelpCircle size={16} className="text-indigo-400" />
          </div>
          <p className="text-sm font-black text-white">よくある質問</p>
        </div>
        <div className="space-y-2">
          <Faq
            q="自分専用のQRコードを作れますか？"
            a="いいえ、アーティスト個人の常設QRはありません。出演するイベントごとにオーガナイザーが発行するQRの中に、配分先として登録されます。"
          />
          <Faq
            q="出金はいつからできますか？"
            a="決済が行われてから2週間（14日）後に出金可能になります（振込手数料¥500が差し引かれます）。「出金管理」で「◯月◯日以降に出金可能」と表示されます。"
          />
          <Faq
            q="口座登録したのに『受取可能』にならない"
            a="Stripe側の本人確認完了後、オーナー（運営）による最終審査が必要です。「口座開設審査中」の間はこの審査待ちの状態です。"
          />
        </div>
      </div>
    </div>
  );
}

function OrganizerGuide() {
  return (
    <div className="space-y-4">
      <Section
        icon={<CalendarPlus size={16} className="text-pink-500" />}
        title="① イベント作成〜公開申請"
        subtitle="Events"
      >
        <p>「新規イベント作成」からタイトル・会場・開始/終了日時・出演アーティストを入力して作成します（作成直後は「下書き」状態です）。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>出演アーティストは、コネクション済みのアーティストから選ぶか、「+ 新規アーティストに依頼」で検索して依頼メッセージを添えて招待できます</li>
          <li>公開するには、イベント詳細ページの「エージェントに承認依頼を送る」を押します（「承認待ち」状態になります）</li>
          <li>担当エージェント／運営が承認すると「公開済み」になります。自分がエージェントを兼ねる場合は自己承認できず、運営の承認が必要です</li>
          <li>「下書き」「承認待ち」の間だけ、作成者本人がイベントを削除できます</li>
        </ul>
      </Section>

      <Section
        icon={<QrCode size={16} className="text-pink-500" />}
        title="② QRコード・商品の設計"
        subtitle="QR Config"
      >
        <p>イベント詳細ページの「QR 作成」から、チア／チケット用のQRコードを商品タイプ別に発行します。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>商品タイプは「スタンダード」「メッセージ」「エントランス」「カスタム（バウチャー／ドリンクチケット）」。企画・承認前のタイプにはロックがかかり「エージェントと企画・承認後に解放」と表示されます</li>
          <li>価格は「ワンプライス」または「レンジ」（スライダーで金額幅・単位を指定）から選べます</li>
          <li>配分設定で、受け取り先（主催者名義／演者名義）ごとに比率（%）を割り当てます（合計100%が必須）</li>
          <li>エントランス（入場チケット）は3タイプあります: <b>Aタイプ（5日前確定）</b>は予約時にカードを保存し5日前に自動決済、<b>Bタイプ（即時確定）</b>は予約時に即時決済（中止時の返金手数料リスクはオーガナイザー負担）、<b>Cタイプ（当日決済）</b>は事前予約なしで当日のタッチ決済またはQR自己決済のみです</li>
          <li>QR詳細画面の「印刷する」から、会場掲示用の高解像度QRを印刷できます</li>
        </ul>
      </Section>

      <Section
        icon={<ScanLine size={16} className="text-pink-500" />}
        title="③ 当日の会場運営"
        subtitle="Check-in & Touch Pay"
      >
        <ul className="list-disc pl-4 space-y-1">
          <li>
            <b>表示用タブレット（子機）を用意できない場合は、印刷したQRコードを会場に掲示するだけで運用できます。</b>
            QR詳細画面の「印刷する」から会場掲示用の高解像度QRを出力し、テーブルや壁に貼っておけば、お客様がご自身のスマートフォンで読み取って直接決済できます。子機や親機パネルの設置は不要です。
            タイムテーブルに合わせてQR表示を自動切替したい場合は子機用タブレットが必要になりますが、
            <span className="text-indigo-300">表示用タブレットのレンタルも承っています</span>
            。ご希望の場合は
            <a href="mailto:support@direct-cheers.com" className="text-indigo-300 underline">support@direct-cheers.com</a>
            または担当エージェントまでご相談ください
          </li>
          <li>スタッフが対応できる場合は「入場スキャナを起動」からカメラでお客様のチケットQRを読み取り、「入場OK」「入場済みです」「無効なチケット」等を即座に判定できます</li>
          <li>「対面タッチ決済」（Touch Pay、タッチ決済用アプリが必要）は、Bluetoothカードリーダーを接続し、対象商品（QR作成時に「対面タッチ決済を許可する」をONにしたもの）をその場で決済できます。決済完了後、初めてのお客様には子機のQRコードを読み取ってもらいます。専用機材（カードリーダー）のレンタルとエージェントの現地帯同が必要になるため、利用したい場合は事前にご相談ください</li>
          <li>「親機パネル」では接続中の子機（タブレット等の表示端末）にタイムテーブルでQRを自動配信でき、「子機モード」はその表示専用のキオスク画面です</li>
          <li>「ダッシュボード」の「別端末でログイン」機能は、スタッフ用タブレットなど別端末にQRでログインさせるためのもので、入場スキャナとは別機能です</li>
          <li>誤操作・誤販売があった場合は、イベント詳細の「売上・決済」タブ（決済ログ）から自分のイベントの決済を取り消せます。ほとんどのカード決済はオーソリ取消（資金移動なし）で済みますが、Bタイプ（即時確定）の入場チケットなど既にキャプチャ済みのものは返金となり決済手数料はオーガナイザー負担です。この取消はイベントが「精算済み」になる前のみ可能で、精算後の返金は運営（admin）のみが対応します</li>
        </ul>
      </Section>

      <Section
        icon={<FileCheck2 size={16} className="text-pink-500" />}
        title="④ エビデンス提出"
        subtitle="Evidence"
      >
        <p>イベント終了後、「開催証跡を提出して承認依頼する」から、写真（最大10枚）・動員数・コメント（任意）を提出します。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>提出しただけでは自動で精算されません。運営が証跡を確認したうえで精算処理が実行されます</li>
          <li>差し戻された場合はダッシュボードに通知が表示され、再提出できます</li>
        </ul>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mt-2">
          <p className="text-[11px] font-black text-red-400">⚠ 提出・精算の期限はイベント開始から7日以内です</p>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            開始から5日目（期限の2日前）に、担当エージェントへ「オーソリ期限が迫っています」の警告通知が届きます。
            7日を過ぎても精算が完了していない場合、システムが自動的にそのイベントの決済をすべて取り消し（カード決済はオーソリ取消、決済済みのものは返金）、イベント自体も「中止」扱いになります。
            返金にかかった決済手数料はオーガナイザー負担として計上されるため、証跡提出と精算は早めに進めてください。
          </p>
        </div>
      </Section>

      <Section
        icon={<Landmark size={16} className="text-pink-500" />}
        title="⑤ 口座登録"
        subtitle="Bank Setup"
      >
        <p>「プロフィール」の口座登録から、Stripe Connectでの本人確認・口座登録に進みます（種別選択→氏名→生年月日・電話→住所→事業情報の5ステップ）。</p>
        <p>Stripe側の手続き完了後は「口座開設審査中」となり、運営（オーナー）による最終承認をお待ちいただきます。承認されると受け取りが可能になります。</p>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mt-2">
          <p className="text-[11px] font-black text-amber-400">⚠ 口座登録が未完了だとQRの決済が失敗します</p>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            決済はオーガナイザーのStripe Connectアカウントを経由するため、QR自体は口座登録前でも作成できますが、口座登録・審査が完了していないとそのイベントのすべての決済がエラーになり受け付けられません。イベントを公開する前に、必ず口座登録を完了させてください。
          </p>
        </div>
      </Section>

      <Section
        icon={<Wallet size={16} className="text-pink-500" />}
        title="⑥ 出金"
        subtitle="Payout"
      >
        <p>「出金管理」で「出金可能」「保留中」「凍結中」の残高を確認できます。売上は決済が行われてから2週間（14日）後に出金可能になり、振込手数料¥500が差し引かれます。</p>
        <p>チャージバックが発生すると該当額が「凍結中」に区分され、出金が一時停止されます。</p>
      </Section>

      <Section
        icon={<TrendingUp size={16} className="text-pink-500" />}
        title="⑦ 売上・精算の確認"
        subtitle="Statistics / Income / Settlement"
      >
        <ul className="list-disc pl-4 space-y-1">
          <li>「統計」: 送ったチア・受取配分の累計サマリー（参考値）</li>
          <li>「収支レポート」（Income）: 確定申告・青色申告記帳用の月次内訳（着金日基準）</li>
          <li>「確定精算レポート」: イベントが「精算済み」になった後に見られる、QR別・受取人別の正式な確定レポート（配分額は自動算出で手動変更不可）</li>
        </ul>
      </Section>

      <Section
        icon={<UserPlus size={16} className="text-pink-500" />}
        title="⑧ 出演依頼"
        subtitle="Lineup Invitations"
      >
        <p>すでにDirect Cheersに登録済みのアーティストをイベントに呼ぶための機能です。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>イベントの作成・編集画面の中で行います。コネクション済みのアーティストから選ぶか、名前検索して依頼メッセージを添えて送ります</li>
          <li>依頼を受けたアーティストのダッシュボードに「出演依頼」として通知され、承諾されると「出演確定」になります</li>
          <li>出演依頼をきっかけに、アーティストとのメッセージ画面（DM）が自動的に作られます</li>
        </ul>
      </Section>

      <Section
        icon={<UserPlus size={16} className="text-indigo-400" />}
        title="⑨ 会員招待"
        subtitle="Invitations（招待管理）"
      >
        <p>まだDirect Cheersに登録していない人を、新規に「アーティスト」ロールとして招待するための、出演依頼とは別の機能です。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>「招待管理」画面から招待リンクを発行します（有効期限30日、可能な場合はメールも自動送信されます）</li>
          <li>先にアーティストを招待して登録してもらってから、上記「⑧ 出演依頼」で個別のイベントに呼ぶ、という順序で使います</li>
        </ul>
      </Section>

      <Section
        icon={<XCircle size={16} className="text-red-400" />}
        title="⑩ イベントの中止"
        subtitle="Cancellation"
      >
        <p>イベント詳細ページの「中止申請」から中止の手続きができます。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>「下書き」「承認待ち」の段階であれば、承認不要でそのまま「中止」になります</li>
          <li>「公開済み」「開催中」の段階では「中止申請中」となり、担当エージェント（または運営）の承認を経て初めて「中止」が確定します。却下された場合は「公開済み」に戻ります</li>
          <li>中止が承認されると、まだキャプチャされていないカード決済（オーソリ中のもの。ほとんどのカード決済がこれに該当します）はシステムが自動的に取り消し、お客様に負担はかかりません</li>
          <li>Bタイプ（即時確定）の入場チケットなど、既にキャプチャ済みで決済が完了しているものは自動では取り消されないため、イベント詳細の「売上・決済」タブ（決済ログ）から個別に取消（返金）が必要です</li>
        </ul>
      </Section>

      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20 shrink-0">
            <HelpCircle size={16} className="text-indigo-400" />
          </div>
          <p className="text-sm font-black text-white">よくある質問</p>
        </div>
        <div className="space-y-2">
          <Faq
            q="イベントを作成したらすぐ公開されますか？"
            a="いいえ。作成直後は「下書き」で、「エージェントに承認依頼を送る」を押して承認されるまで一般には公開されません。"
          />
          <Faq
            q="お客様への返金はオーガナイザーが行いますか？"
            a="はい、できます。精算前のイベントであれば、イベント詳細の「売上・決済」タブ（決済ログ）から自分のイベントの決済を取り消せます（オーソリ中のものは取消、キャプチャ済みのものは返金）。イベントが「精算済み」になった後の返金のみ、運営（admin）が対応します。"
          />
          <Faq
            q="前売り分はどうなりますか？"
            a="ほとんどのカード決済は「オーソリのみ」で保留されているため、イベント中止が承認されると自動的に取り消され、お客様に負担はかかりません。Bタイプ（即時確定）の入場チケットなど既にキャプチャ済みのものは自動では取り消されないため、決済ログから個別に取消（返金）してください。"
          />
          <Faq
            q="エビデンスを提出したのに精算されません"
            a="提出後は運営による確認を経て精算処理が実行されるため、反映まで日数がかかることがあります。差し戻された場合はダッシュボードの通知から再提出してください。"
          />
        </div>
      </div>
    </div>
  );
}

export function HelpContent({
  defaultRole,
  visibleRoles,
}: {
  defaultRole: HelpRole;
  visibleRoles: HelpRole[];
}) {
  const [tab, setTab] = useState<HelpRole>(defaultRole);
  const tabs = TABS.filter((t) => visibleRoles.includes(t.id));

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Help & Guide</p>
        <h1 className="text-xl font-black text-white mt-1">利用マニュアル</h1>
        <p className="text-xs text-slate-500 mt-1">Direct Cheersの使い方をロール別にご案内します</p>
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 text-[11px] font-bold rounded-xl py-2 transition-colors ${
                tab === t.id
                  ? "bg-pink-500 text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === "user" && <UserGuide />}
      {tab === "organizer" && <OrganizerGuide />}
      {tab === "artist" && <ArtistGuide />}

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
        <Mail size={14} className="text-slate-500 mt-0.5 shrink-0" />
        <p className="text-[10px] text-slate-500 leading-relaxed">
          このマニュアルで解決しない場合は、
          <a href="mailto:support@direct-cheers.com" className="text-slate-300 underline">
            support@direct-cheers.com
          </a>
          までお問い合わせください。
        </p>
      </div>
    </div>
  );
}
