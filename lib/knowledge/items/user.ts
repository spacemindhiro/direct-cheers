import type { KnowledgeItem } from "../types";

// 一般ユーザー向け（ヘルプ「一般ユーザー」タブ）
export const USER_ITEMS: KnowledgeItem[] = [
  {
    kind: "section",
    id: "user.payment-prep",
    minRole: "user",
    title: "支払い方法の準備（いちばん大事）",
    help: { tab: "user", icon: "Zap", subtitle: "Payment Speed" },
    sources: ["app/[locale]/dashboard/page.tsx", "components/link-setup-form.tsx"],
    body: [
      { type: "p", text: "決済をスムーズに行うために、以下のいずれかを最初に設定しておくことを強くおすすめします。ダッシュボードのトップにも同じ案内が表示されます。" },
      {
        type: "ul",
        items: [
          "**Apple Pay**（iPhone）: 「ウォレット」アプリでカードを登録しておくと、決済画面でワンタッチで支払えます。ただし**LINEなどアプリ内ブラウザではApple Payは使えません**",
          "**Google Pay**（Android）: 「Google ウォレット」アプリでカードを登録しておくと同様にワンタッチで支払えます",
          "**Stripe Link**: メールアドレスとカードを登録しておくと、どんな環境でもワンタッチで決済できます。**Apple Pay/Google Payが使えない場面のバックアップとして特におすすめです**（登録方法は[[user.link-setup]]）",
          "いずれも未設定の場合はカード番号の手入力でも決済できますが、毎回入力が必要でイベント当日は時間がかかります。手入力の決済画面には「将来の支払いのためにカード情報を保存する」というチェックボックスが表示されるので、ここにチェックを入れておくと次回以降はカード番号の再入力が不要になります",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "user.link-setup",
    minRole: "user",
    title: "Stripe Link にカードを登録する",
    help: { tab: "user", icon: "CreditCard", subtitle: "Stripe Link", video: "u-04" },
    sources: ["components/link-setup-form.tsx", "app/[locale]/link-setup/page.tsx", "app/api/stripe/link-setup/route.ts"],
    body: [
      { type: "p", text: "イベント当日にカード番号を打ち込まずに支払えるようにしておく設定です。LINEの中のブラウザなどApple Payが使えない場面でも使えます。" },
      {
        type: "ul",
        items: [
          "ダッシュボードの「Stripe Linkにカードを登録する」（または「/link-setup」）を開きます",
          "カード番号・有効期限・セキュリティコードを入力し、国（カードを発行した国）を選びます。カード情報はStripeが預かり、Direct Cheers側には送られません",
          "**携帯電話番号と氏名は必ず入力してください**。「オプション」と表示されていますが、空のままだとStripe Linkのアカウントは作られず、カードを保存しただけになります（メールアドレスはログイン中のものが自動で入っています）",
          "「カードを登録する」を押し、携帯電話にショートメッセージで認証コードが届いたら入力します",
          "「登録完了」と表示されれば終わりです。ダッシュボードの表示が「Stripe Link 登録済み」に変わり、次回からは決済画面でワンタッチで支払えます",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "user.login",
    minRole: "user",
    title: "会員登録・ログイン",
    help: { tab: "user", icon: "KeyRound", subtitle: "Member Access" },
    sources: ["components/login-form.tsx", "app/[locale]/dashboard/passkeys/page.tsx", "app/api/auth/send-magic-link/route.ts"],
    body: [
      { type: "p", text: "「パスキー」（顔認証・指紋認証）を登録しておくと、次回からはメールアドレスの入力なしで一瞬にログインできます。まだの方は「アカウント管理」の「パスキー管理」から登録しておくことを強くおすすめします。" },
      {
        type: "ul",
        items: [
          "パスキーは端末ごとに登録が必要です。複数の端末（スマートフォン・PCなど）を使う場合は、それぞれの端末で登録しておくと便利です",
          "専用の会員登録という手続きはありません。チアやチケットを初めて購入した時点で、入力したメールアドレスをもとに自動的にアカウントが作成されています",
          "パスキーに対応していない端末では、ログイン画面でメールアドレスを入力し「ログインリンクを送る」を押すとメールが届くので、本文中のリンクをタップしてログインできます（パスコードの入力は不要です）",
          "Googleアカウントでもログインできます",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "user.send-cheers",
    minRole: "user",
    title: "チアを送る・チケットを購入する",
    help: { tab: "user", icon: "Heart", subtitle: "Send Cheers", video: "u-01" },
    sources: ["app/c/[qrConfigId]/page.tsx", "components/cheers-payment-form.tsx", "app/api/pay/cheers/route.ts"],
    body: [
      { type: "p", text: "会場に掲示されているQRコードを読み取ると、アーティストやイベントの専用ページが開きます。" },
      {
        type: "ul",
        items: [
          "金額はあらかじめ決まっている場合と、スライダーで自分で選べる場合があります（イベントによっては人数・杯数の指定も）",
          "初めて利用する端末ではメールアドレスの入力が必要ですが、一度入力すればその端末では次回から自動的に呼び出され、入力画面自体が表示されなくなります。ログイン済みの場合は完全に固定され、未ログインでも同じ端末なら自動入力されます（別の方が使う場合のみ「変更」から入力し直せます）",
          "「¥○○ を応援する」（チケットの場合は「購入する」）ボタンを押すと決済に進みます",
          "Apple Pay・Google Pay・クレジットカードに対応しています",
          "初めて入力したメールアドレスでアカウントが自動作成されるため、事前の会員登録は不要です",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "user.message-cheer",
    minRole: "user",
    title: "メッセージ付きで応援する",
    help: { tab: "user", icon: "MessageCircleHeart", subtitle: "Cheer Message", video: "u-02" },
    sources: ["app/c/[qrConfigId]/thanks/page.tsx", "app/api/pay/message/route.ts"],
    body: [
      { type: "p", text: "主催者が「メッセージ」タイプで作ったQRでは、応援と一緒にアーティストへひと言メッセージを送れます。" },
      {
        type: "ul",
        items: [
          "QRを読み取って応援する流れは[[user.send-cheers]]と同じです",
          "決済が終わると、cheers!カードの下に「メッセージを送る」欄が表示されます",
          "ニックネーム（任意）とメッセージを入力して「送る」を押すと、「メッセージを送りました！」と表示されアーティストに届きます",
          "メッセージを書かずに「スキップ」することもできます",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "user.my-tickets",
    minRole: "user",
    title: "マイチケットの使い方",
    help: { tab: "user", icon: "Ticket", subtitle: "Wallet" },
    sources: ["components/digital-ticket.tsx", "app/[locale]/tickets/page.tsx"],
    body: [
      { type: "p", text: "ダッシュボードの「マイチケット」から、購入したチケットをQRコード付きのデジタルチケットで確認できます。" },
      {
        type: "ul",
        items: [
          "会場の入口でスタッフにこのQRコードを見せるだけで入場できます（印刷は不要です）",
          "入場が完了すると券面が「入場済み」の表示に変わります",
          "「Apple Walletに追加」ボタンで、iPhoneのWalletアプリからも表示できます",
          "事前確定型（5日前確定）のチケットのみ、イベント5日前まで「キャンセルする」が可能です",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "user.collection",
    minRole: "user",
    title: "カードコレクション・応援履歴",
    help: { tab: "user", icon: "Layers", subtitle: "Collection" },
    body: [
      { type: "p", text: "ダッシュボードの「Cheers History」で、これまで応援した金額やコメントの履歴を確認できます（直近20件のダイジェスト表示）。過去分もすべて遡って見たい場合は「カードコレクション」をご利用ください（全期間、ページ送りで確認できます）。" },
      { type: "p", text: "「カードコレクション」では、応援したアーティストのカードをまとめて振り返れます。" },
      { type: "p", text: "応援先のアーティストやオーガナイザーがお礼のメッセージを用意している場合、該当するカードに「メッセージが届いています」と表示されます。カードをタップすると裏返り、メッセージや特典リンクを確認できます（同じQRコードで応援した方には共通の内容が届く仕組みで、個人宛てではありません）。" },
      { type: "p", text: "お礼のメッセージ（サンクス特典）が公開されると、ダッシュボードに「お返しが届いています」というお知らせが表示されます。カードコレクションを開くと、このお知らせは消えます。" },
    ],
    sources: ["app/api/qr/[qrConfigId]/thanks/route.ts", "app/[locale]/dashboard/collection/page.tsx"],
  },
  {
    kind: "section",
    id: "user.account",
    minRole: "user",
    title: "アカウント設定",
    help: { tab: "user", icon: "UserCog", subtitle: "Account" },
    sources: ["app/[locale]/dashboard/account/page.tsx", "app/[locale]/dashboard/passkeys/page.tsx"],
    body: [
      {
        type: "ul",
        items: [
          "「アカウント管理」の「応援履歴を統合」から、うっかり別のメールアドレスで応援してしまった履歴を今のアカウントにまとめられます",
          "パスキーに対応していない端末のために、「アカウント管理」からパスワード（8文字以上）を設定できます",
          "「パスキー管理」から、登録済みデバイスの確認・名称変更・削除・追加ができます",
        ],
      },
    ],
  },
  {
    kind: "faq",
    id: "user.faq.apple-pay",
    minRole: "user",
    help: { tab: "user" },
    sources: ["components/cheers-payment-form.tsx"],
    q: "Apple Payのボタンが出てきません",
    a: "LINEなどアプリ内ブラウザで開いている場合、その仕様上Apple Payは使用できません。画面右上などのメニューから「他のブラウザで開く」を選び、SafariやChromeなど通常のブラウザで開き直してください。",
  },
  {
    kind: "faq",
    id: "user.faq.login-mail",
    minRole: "user",
    help: { tab: "user" },
    sources: ["components/login-form.tsx", "app/api/auth/send-magic-link/route.ts"],
    q: "ログインリンクのメールが届きません",
    a: "迷惑メールフォルダをご確認ください。それでも届かない場合は、ログイン画面から再度メールアドレスを入力して送信し直してください。",
  },
  {
    kind: "faq",
    id: "user.faq.merge",
    minRole: "user",
    help: { tab: "user" },
    sources: ["app/[locale]/dashboard/account/page.tsx", "app/api/account/merge-request/route.ts", "app/api/account/merge-confirm/route.ts"],
    q: "複数のメールアドレスで応援してしまいました",
    a: "「アカウント管理」の「応援履歴を統合」から、まとめたいメールアドレスを入力して確認メールを送ると、履歴を1つのアカウントにまとめられます。",
  },
  {
    kind: "faq",
    id: "user.faq.ticket-cancel",
    minRole: "user",
    help: { tab: "user" },
    sources: ["components/digital-ticket.tsx", "app/api/entrance/reservations/[reservationId]/cancel/route.ts"],
    q: "購入したチケットをキャンセルしたい",
    a: "事前確定型（5日前確定）のチケットのみ、マイチケット画面からイベント5日前までキャンセルできます。それ以外のチケットタイプは購入後のキャンセルに対応していません。",
  },
];
