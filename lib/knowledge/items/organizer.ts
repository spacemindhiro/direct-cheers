import type { KnowledgeItem } from "../types";

// オーガナイザー向け（ヘルプ「オーガナイザー」タブ）。group で「準備・機能」「当日の運用」に分かれる
export const ORGANIZER_ITEMS: KnowledgeItem[] = [
  // ── 準備・機能 ──
  {
    kind: "section",
    id: "organizer.invite-register",
    minRole: "organizer",
    title: "招待リンクから登録する",
    help: { tab: "organizer", group: "prep", icon: "UserPlus", subtitle: "Invite Registration", video: "o-01" },
    sources: ["components/invite-accept-client.tsx", "app/[locale]/invite/[token]/page.tsx", "app/api/invitations/[token]/accept/route.ts", "app/api/invitations/[token]/claim/route.ts"],
    body: [
      { type: "p", text: "エージェント／運営やほかのオーガナイザーから招待リンクが届いた場合、リンクを開いて「登録して受け取る」を押すだけで、追加のメール確認なしにその場でアカウント作成からログインまで完了します。" },
      { type: "p", text: "すでにDirect Cheersに登録済みの場合は、ログインするだけで招待を受け取れます。" },
    ],
  },
  {
    kind: "section",
    id: "organizer.profile",
    minRole: "organizer",
    title: "プロフィールを設定する",
    help: { tab: "organizer", group: "prep", icon: "UserCog", subtitle: "Organizer Profile", video: "o-02-1" },
    sources: ["app/[locale]/dashboard/profile/page.tsx", "app/api/profile/route.ts"],
    body: [
      { type: "p", text: "「プロフィール」で、主催者名・主催者用画像・活動団体名・紹介文・海外カード明細用の英字表記を設定できます。イベントやQR、お客様のカード利用明細に表示される情報です。" },
      {
        type: "ul",
        items: [
          "DJなどとして自分自身も出演する（オーガナイザー兼アーティスト）場合は、「DJとして出演する場合」でアーティスト名・アーティスト用画像・英字表記を別途設定できます（紹介文は主催者情報と共通です）",
          "入力後は「保存する」を押してください",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "organizer.bank",
    minRole: "organizer",
    title: "口座登録",
    help: { tab: "organizer", group: "prep", icon: "Landmark", subtitle: "Bank Setup", video: "o-02" },
    sources: ["app/[locale]/dashboard/profile/page.tsx", "app/[locale]/dashboard/profile/bank-setup/page.tsx", "lib/bank-status.ts", "app/api/stripe/connect/onboarding/route.ts"],
    body: [
      { type: "p", text: "「プロフィール」の口座登録から、Stripe Connectでの本人確認・口座登録に進みます（種別選択→氏名→生年月日・電話→住所→事業情報の5ステップ）。" },
      { type: "p", text: "Stripe側の手続き完了後は「口座開設審査中」となり、運営（オーナー）による最終承認をお待ちいただきます。承認されると受け取りが可能になります。" },
      {
        type: "warn",
        tone: "amber",
        title: "口座登録が未完了だとQRの決済が失敗します",
        text: "決済はオーガナイザーのStripe Connectアカウントを経由するため、QR自体は口座登録前でも作成できますが、口座登録・審査が完了していないとそのイベントのすべての決済がエラーになり受け付けられません。イベントを公開する前に、必ず口座登録を完了させてください。",
      },
    ],
  },
  {
    kind: "section",
    id: "organizer.create-event",
    minRole: "organizer",
    title: "イベントを作成する",
    help: { tab: "organizer", group: "prep", icon: "CalendarPlus", subtitle: "Events", video: "o-03" },
    sources: ["components/event-create-form.tsx", "app/[locale]/dashboard/events/create/page.tsx", "app/api/events/create/route.ts"],
    body: [
      { type: "p", text: "「新規イベント作成」からタイトル・会場・開始/終了日時・出演アーティストを入力して作成します（作成直後は「下書き」状態です）。" },
      {
        type: "ul",
        items: [
          "出演アーティストは、コネクション済みのアーティストから選ぶか、「+ 新規アーティストに依頼」で検索して依頼メッセージを添えて招待できます（詳しくは[[organizer.lineup-invite]]参照）",
          "「下書き」の間は、作成者本人がイベントを削除できます",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "organizer.lineup-invite",
    minRole: "organizer",
    title: "出演依頼",
    help: { tab: "organizer", group: "prep", icon: "UserPlus", subtitle: "Lineup Invitations", video: "o-04" },
    sources: ["components/event-create-form.tsx", "components/event-edit-form.tsx", "app/api/events/create/route.ts", "app/api/events/[eventId]/route.ts", "app/api/events/[eventId]/lineup/[artistId]/route.ts", "components/lineup-invitations.tsx"],
    body: [
      { type: "p", text: "すでにDirect Cheersに登録済みのアーティストをイベントに呼ぶための機能です。" },
      {
        type: "ul",
        items: [
          "イベントの作成・編集画面の中で行います。コネクション済みのアーティストから選ぶか、名前検索して依頼メッセージを添えて送ります",
          "依頼を受けたアーティストのダッシュボードに「出演依頼」として通知され、承諾されると「出演確定」になります",
          "出演依頼をきっかけに、アーティストとのメッセージ画面（DM）が自動的に作られます",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "organizer.member-invite",
    minRole: "organizer",
    title: "会員招待",
    help: { tab: "organizer", group: "prep", icon: "UserPlus", iconTone: "indigo", subtitle: "Invitations（招待管理）", video: "o-05" },
    sources: ["components/invitations-section.tsx", "components/invite-create-form.tsx", "app/[locale]/dashboard/invitations/page.tsx", "app/api/invitations/route.ts"],
    body: [
      { type: "p", text: "まだ「アーティスト」ロールを持っていない人を、新規にアーティストとして招待するための、出演依頼とは別の機能です。招待には2つのやり方があります。" },
      {
        type: "ul",
        items: [
          "**すでにDirect Cheersに登録済みの人を招待する場合**: 名前で検索して選ぶと、その人のアカウントに招待が届きます（一般ユーザーとして使っていた人をアーティストに切り替える場合など）",
          "**まだDirect Cheersに登録していない人を招待する場合**: 相手のメールアドレスを直接入力して招待リンクを発行します（有効期限30日、メールも自動送信されます。まれに失敗した場合は招待リンクを手動で共有してください）。リンクを踏むとその場でアカウントが作成され、アーティストとして登録されます",
          "いずれの場合も、招待を承諾した時点でロールが「アーティスト」に切り替わります（すでにより上位のロールを持っている人には影響しません）",
          "先にアーティストを招待して登録してもらってから、上記[[organizer.lineup-invite]]で個別のイベントに呼ぶ、という順序で使います",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "organizer.request-approval",
    minRole: "organizer",
    title: "公開の承認を依頼する",
    help: { tab: "organizer", group: "prep", icon: "CheckCircle2", subtitle: "Publish Approval", video: "o-06" },
    sources: ["components/event-request-review-button.tsx", "app/api/events/[eventId]/request-review/route.ts"],
    body: [
      { type: "p", text: "イベント詳細ページの「エージェントに承認依頼を送る」を押すと、公開の承認を依頼できます（「承認待ち」状態になります）。" },
      {
        type: "ul",
        items: [
          "担当エージェント／運営が承認すると「公開済み」になります。自分がエージェントを兼ねる場合は自己承認できず、運営の承認が必要です",
          "「承認待ち」の間も、作成者本人がイベントを削除できます",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "organizer.create-qr",
    minRole: "organizer",
    title: "QRを作成する（スタンダード／メッセージ）",
    help: { tab: "organizer", group: "prep", icon: "QrCode", subtitle: "QR Config", video: "o-07" },
    sources: ["components/qr-create-form.tsx", "app/api/qr/create/route.ts"],
    body: [
      { type: "p", text: "イベント詳細ページの「QR 作成」から、チア／チケット用のQRコードを商品タイプ別に発行します。" },
      {
        type: "ul",
        items: [
          "商品タイプは「スタンダード」「メッセージ」「エントランス」「カスタム（バウチャー／ドリンクチケット）」。企画・承認前のタイプにはロックがかかり「エージェントと企画・承認後に解放」と表示されます",
          "価格は「ワンプライス」または「レンジ」（スライダーで金額幅・単位を指定）から選べます",
          "配分設定で、受け取り先（主催者名義／演者名義）ごとに比率（%）を割り当てます（合計100%が必須）",
          "入場チケット（エントランス）の作り方は[[organizer.entrance-qr]]を参照してください",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "organizer.entrance-qr",
    minRole: "organizer",
    title: "エントランスQRを作成する",
    help: { tab: "organizer", group: "prep", icon: "DoorOpen", subtitle: "Entrance QR", video: "o-11" },
    sources: ["components/qr-create-form.tsx", "app/api/qr/create/route.ts", "lib/purchase-window.ts"],
    body: [
      { type: "p", text: "入場チケットをQRで販売するときは、「QR 作成」で商品タイプ「エントランス」を選びます。" },
      {
        type: "ul",
        items: [
          "決済タイプは3つあります: **前売事後確定タイプ（5日前確定）**は予約時にカードを保存し5日前に自動決済（販売開始・終了日時を入力）、**前売即時確定タイプ（即時確定）**は予約時に即時決済（中止時の返金手数料リスクはオーガナイザー負担のため、販売上限数の入力が必須）、**当日決済タイプ**は事前予約なしで当日のタッチ決済またはQR自己決済のみです",
          "ラベルはお客様や親機の画面に出る商品名です（例: 当日券）。エントランスの金額は1つに固定で、スライダーでは選べません",
          "当日決済タイプでも「当日決済タイプでも在庫管理する」をオンにすると、販売枚数に上限を設けられます",
          "「対面タッチ決済を許可する」をオンにすると、当日この商品を親機のカードリーダーで販売できます",
          "「ウェルカムチアを含める」で、入場料の一部を演者へのチアとして切り出せます。候補に出るのは、同じ金額のチアQRをすでに用意している演者だけです（1円でも違うと出ません）",
          "配分先の合計が100%になっていることを確認して「QRを作成」を押せば完成です。作ったQRの詳細画面の「招待チケット発行」から、関係者向けの招待チケットも発行できます",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "organizer.print-qr",
    minRole: "organizer",
    title: "QRを印刷する",
    help: { tab: "organizer", group: "prep", icon: "Printer", subtitle: "Print QR", video: "o-08" },
    sources: ["components/qr-display.tsx"],
    body: [{ type: "p", text: "QR詳細画面の「印刷する」から、会場掲示用の高解像度QRを印刷できます。" }],
  },
  {
    kind: "section",
    id: "organizer.sales-cancel",
    minRole: "organizer",
    title: "売上を見る・決済を取り消す",
    help: { tab: "organizer", group: "prep", icon: "ScanLine", subtitle: "Sales & Cancellation", video: "o-09" },
    sources: ["components/event-detail-tabs.tsx", "app/api/events/[eventId]/transactions/[transactionId]/cancel/route.ts"],
    body: [
      { type: "p", text: "誤操作・誤販売があった場合は、イベント詳細の「売上・決済」タブ（決済ログ）から自分のイベントの決済を取り消せます。売上自体もこのタブでリアルタイムに確認できます。" },
      {
        type: "ul",
        items: [
          "ほとんどのカード決済はオーソリ取消（資金移動なし）で済みますが、前売即時確定タイプ（即時確定）の入場チケットなど既にキャプチャ済みのものは返金となり決済手数料はオーガナイザー負担です",
          "この取消はイベントが「精算済み」になる前のみ可能で、精算後の返金は運営（admin）のみが対応します",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "organizer.evidence",
    minRole: "organizer",
    title: "エビデンス提出",
    help: { tab: "organizer", group: "prep", icon: "FileCheck2", subtitle: "Evidence", video: "o-10" },
    sources: ["lib/settlement-deadline.ts", "app/api/cron/auto-cancel-unsettled/route.ts", "app/api/admin/check-auth-expiry/route.ts", "components/evidence-upload-form.tsx"],
    body: [
      { type: "p", text: "イベント終了後、「開催証跡を提出して承認依頼する」から、写真（最大10枚）・動員数・コメント（任意）を提出します。" },
      {
        type: "ul",
        items: [
          "提出しただけでは自動で精算されません。運営が証跡を確認したうえで精算処理が実行されます",
          "差し戻された場合はダッシュボードに通知が表示され、再提出できます",
        ],
      },
      {
        type: "warn",
        tone: "red",
        title: "提出・精算の期限はイベント開始から{{AUTH_EXPIRE_DAYS}}日以内です",
        text: "開始から{{AUTH_EXPIRE_WARN_DAY}}日目（期限の{{AUTH_EXPIRE_WARN_DAYS_BEFORE}}日前）に、担当エージェントへ「オーソリ期限が迫っています」の警告通知が届きます。 {{AUTH_EXPIRE_DAYS}}日を過ぎても精算が完了していない場合、システムが自動的にそのイベントの決済をすべて取り消し（カード決済はオーソリ取消、決済済みのものは返金）、イベント自体も「中止」扱いになります。 返金にかかった決済手数料はオーガナイザー負担として計上されるため、証跡提出と精算は早めに進めてください。",
      },
    ],
  },
  {
    kind: "section",
    id: "organizer.settlement-reports",
    minRole: "organizer",
    title: "売上・精算の確認",
    help: { tab: "organizer", group: "prep", icon: "TrendingUp", subtitle: "Statistics / Income / Settlement" },
    sources: ["components/settlement-report-client.tsx", "app/[locale]/dashboard/events/[eventId]/settlement/page.tsx", "app/[locale]/dashboard/income/page.tsx"],
    body: [
      {
        type: "ul",
        items: [
          "「統計」: 送ったチア・受取配分の累計サマリー（参考値）",
          "「収支レポート」（Income）: 確定申告・青色申告記帳用の月次内訳（着金日基準）",
          "「確定精算レポート」: イベントが「精算済み」になった後に見られる、QR別・受取人別の正式な確定レポート（配分額は自動算出で手動変更不可）",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "organizer.payout",
    minRole: "organizer",
    title: "出金",
    help: { tab: "organizer", group: "prep", icon: "Wallet", subtitle: "Payout" },
    sources: ["lib/payout-config.ts"],
    body: [
      { type: "p", text: "「出金管理」で「出金可能」「保留中」「凍結中」の残高を確認できます。売上は決済が行われてから{{HOLD_PERIOD}}後に出金可能になり、振込手数料¥{{TRANSFER_FEE}}が差し引かれます。" },
      { type: "p", text: "決済から{{FEE_WAIVER_DAYS}}日を超えた分は、月{{FREE_POOL_MONTHLY_LIMIT}}回に限り振込手数料無料で出金できます。対象の残高がある場合は出金画面に無料枠として案内されます。" },
      { type: "p", text: "チャージバックが発生すると該当額が「凍結中」に区分され、出金が一時停止されます。" },
    ],
  },
  {
    kind: "section",
    id: "organizer.cancel-event",
    minRole: "organizer",
    title: "イベントの中止",
    help: { tab: "organizer", group: "prep", icon: "XCircle", iconTone: "red", subtitle: "Cancellation" },
    sources: ["app/[locale]/dashboard/events/[eventId]/page.tsx", "app/api/events/[eventId]/cancel/route.ts"],
    body: [
      { type: "p", text: "イベント詳細ページの「中止申請」から中止の手続きができます。" },
      {
        type: "ul",
        items: [
          "「下書き」「承認待ち」の段階であれば、承認不要でそのまま「中止」になります",
          "「公開済み」「開催中」の段階では「中止申請中」となり、担当エージェント（または運営）の承認を経て初めて「中止」が確定します。却下された場合は「公開済み」に戻ります",
          "中止が承認されると、まだキャプチャされていないカード決済（オーソリ中のもの。ほとんどのカード決済がこれに該当します）はシステムが自動的に取り消し、お客様に負担はかかりません",
          "前売即時確定タイプ（即時確定）の入場チケットなど、既にキャプチャ済みで決済が完了しているものは自動では取り消されないため、イベント詳細の「売上・決済」タブ（決済ログ）から個別に取消（返金）が必要です",
        ],
      },
    ],
  },

  // ── 当日の運用 ──
  {
    kind: "section",
    id: "organizer.dayof.print-only",
    minRole: "organizer",
    title: "印刷したQRだけで運用する",
    help: { tab: "organizer", group: "dayof", icon: "Printer", subtitle: "Print-Only Setup", video: "d-01" },
    sources: ["components/qr-display.tsx"],
    body: [
      { type: "p", text: "表示用タブレット（子機）を用意できない場合は、印刷したQRコードを会場に掲示するだけで運用できます。" },
      {
        type: "ul",
        items: [
          "QR詳細画面の「印刷する」から会場掲示用の高解像度QRを出力し、テーブルや壁に貼っておけば、お客様がご自身のスマートフォンで読み取って直接決済できます。子機や親機パネルの設置は不要です",
          "タイムテーブルに合わせてQR表示を自動切替したい場合は子機用タブレットが必要になりますが、==表示用タブレットのレンタルも承っています==。ご希望の場合は[support@direct-cheers.com](mailto:support@direct-cheers.com)または担当エージェントまでご相談ください",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "organizer.dayof.scanner",
    minRole: "organizer",
    title: "入場スキャナで検札する",
    help: { tab: "organizer", group: "dayof", icon: "ScanLine", subtitle: "Check-in Scanner", video: "d-02" },
    sources: ["components/checkin-client.tsx", "app/api/entrance/checkin/route.ts"],
    body: [
      { type: "p", text: "スタッフが対応できる場合は「入場スキャナを起動」からカメラでお客様のチケットQRを読み取り、「入場OK」「入場済みです」「無効なチケット」等を即座に判定できます。" },
    ],
  },
  {
    kind: "section",
    id: "organizer.dayof.touchpay",
    minRole: "organizer",
    title: "タッチ決済・子機/親機を使う",
    help: { tab: "organizer", group: "dayof", icon: "Zap", subtitle: "Touch Pay & Devices" },
    sources: ["components/touch-pay-client.tsx", "app/[locale]/dashboard/events/[eventId]/checkin/touch-pay/page.tsx", "components/scanner-qr-client.tsx"],
    body: [
      {
        type: "ul",
        items: [
          "「対面タッチ決済」（Touch Pay、タッチ決済用アプリが必要）は、Bluetoothカードリーダーを接続し、対象商品（QR作成時に「対面タッチ決済を許可する」をONにしたもの）をその場で決済できます。決済完了後、初めてのお客様には子機のQRコードを読み取ってもらいます。専用機材（カードリーダー）のレンタルとエージェントの現地帯同が必要になるため、利用したい場合は事前にご相談ください",
          "「親機パネル」では接続中の子機（タブレット等の表示端末）にタイムテーブルでQRを自動配信でき、「子機モード」はその表示専用のキオスク画面です",
          "「ダッシュボード」の「別端末でログイン」機能は、スタッフ用タブレットなど別端末にQRでログインさせるためのもので、入場スキャナとは別機能です",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "organizer.dayof.checklist",
    minRole: "organizer",
    tier: "detail",
    indexHint: "前日まで・開場前・開場中・トラブル時（Apple Payが出ない・カードリーダーが繋がらない→QR自己決済に切り替え・電波が弱い）・終了後の時系列チェックリスト",
    title: "当日オペレーション（時系列）",
    help: { tab: "organizer", group: "dayof", icon: "ListChecks", subtitle: "Day-of Checklist" },
    sources: ["components/checkin-client.tsx", "components/touch-pay-client.tsx", "components/qr-display.tsx", "components/evidence-upload-form.tsx"],
    body: [
      { type: "p", text: "当日スタッフが手元で見る前提の、時間順のチェックリストです。[[organizer.dayof.print-only|no]]〜[[organizer.dayof.touchpay|no]]の機能説明とあわせてご覧ください。" },
      {
        type: "phase",
        label: "前日まで",
        items: [
          "**口座登録が「審査完了 — 受取可能」になっているか確認**。未完了だと当日のすべての決済がエラーになります（[[organizer.bank|group]]参照）",
          "QR詳細画面の「印刷する」から掲示用QRを印刷。汚れ・紛失に備えて予備を数枚",
          "子機タブレットを使う場合：親機パネルでタイムテーブルを登録し、子機にはダッシュボードの「別端末でログイン」のQRでログインさせておく（子機にパスキーは登録しない）",
          "タッチ決済を使う場合：**カードリーダーのファームウェア更新を前日までに済ませる**。初回接続時に必須更新が自動で走り、数分〜10分以上かかります。更新中は電源を切らず、Wi-Fiの安定した場所で行ってください。当日現地で初めて接続するのは避けてください",
          "開催証跡用に**「当日写真を撮る担当」を決める**。写真がないとイベント終了後の精算に進めません（[[organizer.evidence|group]]参照）",
        ],
      },
      {
        type: "phase",
        label: "開場前（現地）",
        items: [
          "QRをテーブル・壁・受付に掲示。電波の弱い会場では、入口付近でスタッフのスマホから1回テスト決済して、決済画面が開くか確認",
          "子機：表示を確認し、画面の自動ロックをOFF、充電を確保",
          "タッチ決済：Touch Pay画面の「カードリーダーに接続」で接続。接続中に端末側でペア設定のダイアログが出たら**すぐ承認**してください（放置すると接続に失敗します）。子機が起動していないとサインアップQRを出せないので、先に子機を起動",
          "入場スキャナ：受付スタッフのスマホでイベント詳細の「入場スキャナを起動」を開き、カメラの使用を許可",
        ],
      },
      {
        type: "phase",
        label: "開場中",
        items: [
          "入場：お客様のチケットQRを読み取り、結果で対応を分けます。**「入場OK」**→通す／**「入場済みです」**→すでに入場済み。本人確認のうえ判断／**「無効なチケット」**→キャンセル済みや失効。決済し直してもらう",
          "当日券（タッチ決済）：商品と人数を選ぶ →「カードをタッチしてください」でお客様にカードやスマホをかざしてもらう → 完了。**初めてのお客様には子機のサインアップQRを読み取ってもらい**、cheers!カードを受け取れるようにします",
          "売上はイベント詳細の「売上・決済」タブでリアルタイムに確認できます",
          "誤販売はその場で「売上・決済」タブから取消（精算前ならオーガナイザー自身で可能。[[organizer.sales-cancel|group]]参照）",
        ],
      },
      {
        type: "phase",
        label: "トラブル時",
        items: [
          "お客様「Apple Payのボタンが出ない」→ LINEなどアプリ内ブラウザで開いています。メニューの「他のブラウザで開く」からSafari／Chromeで開き直してもらう",
          "お客様「メールが届かない」→ 迷惑メールフォルダを確認。なければログイン画面から再送",
          "親機・子機がログアウトした → ダッシュボードの「別端末でログイン」のQRを読ませて再ログイン",
          "カードリーダーが見つからない（30秒待っても接続しない）→ リーダーの電源を入れ直して「カードリーダーに接続」をやり直す。復旧しなければ**QR自己決済に切り替えて続行**（機材なしで運用できます）",
          "会場の電波が弱い → QR自己決済はお客様自身の回線で動くので影響を受けにくい。回線が必要なのはスタッフ側（子機・親機・入場スキャナ・タッチ決済）だけです",
        ],
      },
      {
        type: "phase",
        label: "終了後（その場で）",
        items: [
          "撮った写真と動員数を、できればその日のうちに「開催証跡を提出して承認依頼する」から提出",
          "**開催から{{AUTH_EXPIRE_DAYS}}日以内に精算が完了しないと、決済がすべて自動取消されイベントは中止扱いになります**（[[organizer.evidence|group]]参照）。提出を後回しにしないでください",
        ],
      },
    ],
  },

  // ── よくある質問（どちらのグループでも表示） ──
  {
    kind: "faq",
    id: "organizer.faq.publish",
    minRole: "organizer",
    help: { tab: "organizer" },
    sources: ["components/event-request-review-button.tsx", "app/api/events/[eventId]/request-review/route.ts", "app/api/events/[eventId]/approve/route.ts"],
    q: "イベントを作成したらすぐ公開されますか？",
    a: "いいえ。作成直後は「下書き」で、「エージェントに承認依頼を送る」を押して承認されるまで一般には公開されません。",
  },
  {
    kind: "faq",
    id: "organizer.faq.refund",
    minRole: "organizer",
    help: { tab: "organizer" },
    sources: ["components/event-detail-tabs.tsx", "app/api/events/[eventId]/transactions/[transactionId]/cancel/route.ts"],
    q: "お客様への返金はオーガナイザーが行いますか？",
    a: "はい、できます。精算前のイベントであれば、イベント詳細の「売上・決済」タブ（決済ログ）から自分のイベントの決済を取り消せます（オーソリ中のものは取消、キャプチャ済みのものは返金）。イベントが「精算済み」になった後の返金のみ、運営（admin）が対応します。",
  },
  {
    kind: "faq",
    id: "organizer.faq.presale",
    minRole: "organizer",
    help: { tab: "organizer" },
    sources: ["app/api/events/[eventId]/cancel/route.ts", "lib/purchase-window.ts"],
    q: "前売り分はどうなりますか？",
    a: "ほとんどのカード決済は「オーソリのみ」で保留されているため、イベント中止が承認されると自動的に取り消され、お客様に負担はかかりません。前売即時確定タイプ（即時確定）の入場チケットなど既にキャプチャ済みのものは自動では取り消されないため、決済ログから個別に取消（返金）してください。",
  },
  {
    kind: "faq",
    id: "organizer.faq.evidence-wait",
    minRole: "organizer",
    help: { tab: "organizer" },
    sources: ["components/evidence-upload-form.tsx", "app/api/events/[eventId]/evidence/reject/route.ts", "app/api/events/[eventId]/settle/route.ts"],
    q: "エビデンスを提出したのに精算されません",
    a: "提出後は運営による確認を経て精算処理が実行されるため、反映まで日数がかかることがあります。差し戻された場合はダッシュボードの通知から再提出してください。",
  },
];
