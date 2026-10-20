import type { KnowledgeItem } from "../types";

// ヘルプには載せない、チアリー(AI)だけが読む仕組み・ルールの説明。
// 根拠は公開している規約・特定商取引法の表記・コードに限る（リポジトリは公開のため、ここに書く＝公開してよい内容）。
// エージェント報酬の割合など、エージェントにしか言えない内部情報は書かない。
export const RULES_ITEMS: KnowledgeItem[] = [
  // ── 全員向け ──
  {
    kind: "section",
    id: "rules.what-is-dc",
    minRole: "user",
    title: "Direct Cheersとは",
    sources: ["components/legal/law-document.tsx"],
    body: [
      { type: "p", text: "Direct Cheers（DC）は、イベント会場に掲示されたQRコードから、出演アーティストやオーガナイザー（主催者）に直接「チア（応援の送金）」を送ったり、入場チケットなどを購入したりできるサービスです。運営はSpaceMind Direct Cheers 事務局です。" },
      { type: "p", text: "決済が終わると、その場でデジタルの応援証明（cheers!カード）がブラウザ上に発行されます。" },
      { type: "p", text: "使う人の立場（ロール）は5つあります：一般ユーザー（応援する人）、アーティスト（出演者）、オーガナイザー（主催者）、エージェント（主催者を支える担当者）、運営（admin）。上の立場の人は、下の立場の人ができることも基本的にできます。" },
    ],
  },
  {
    kind: "section",
    id: "rules.price-and-fees",
    minRole: "user",
    title: "表示価格と手数料",
    sources: ["components/legal/law-document.tsx"],
    body: [
      { type: "p", text: "QRの画面に表示される金額は消費税込みで、お客様が払うのはその金額だけです。システム利用料10%と決済手数料（クレジットカード等 3.96%）は表示価格の中に含まれており、別に上乗せされることはありません。" },
      { type: "p", text: "インターネットの通信料はお客様の負担です。" },
    ],
  },
  {
    kind: "section",
    id: "rules.payment-timing",
    minRole: "user",
    title: "支払いが確定するタイミング（オーソリ）",
    sources: ["app/api/pay/cheers/route.ts", "app/api/admin/events/[eventId]/capture-all/route.ts", "app/api/cron/entrance-auth/route.ts", "app/api/entrance/reserve/route.ts"],
    body: [
      { type: "p", text: "チアやチケットの決済は、購入した時点ではカードの利用枠を確保する「オーソリ（与信）」の状態です。実際の請求は、イベントが開催されたことを運営が確認してから確定します。" },
      { type: "p", text: "このため、イベントが中止になった場合は、確保していた枠が取り消されるだけで、お客様に請求は発生しません。カード会社のアプリなどで一時的に「利用（未確定）」と表示されることがありますが、取り消されれば消えます。" },
      { type: "p", text: "前売事後確定タイプ（5日前確定）の入場チケットは、予約時にはカードを保存するだけで、イベントの5日前に自動でオーソリされます（5日を切ってから予約した場合は予約時にオーソリ）。前売即時確定タイプ（即時確定）の入場チケットだけは、予約したその場で請求が確定するため、イベントが中止になった場合は返金になります。" },
    ],
  },
  {
    kind: "section",
    id: "rules.cancel-policy",
    minRole: "user",
    title: "キャンセル・返金の考え方",
    sources: ["components/legal/law-document.tsx"],
    body: [
      { type: "p", text: "チアなどのデジタルコンテンツは、性質上、決済が終わった後のお客様都合によるキャンセル・返金には応じていません。" },
      {
        type: "ul",
        items: [
          "例外として、前売事後確定タイプ（5日前確定）の入場チケットは、マイチケット画面からイベント5日前までキャンセルできます（[[user.my-tickets]]）",
          "イベントが中止になった場合は、オーソリが取り消されるか、決済済みのものは返金されます",
          "主催者の誤操作・誤販売は、主催者側で取り消されることがあります",
          "それ以外の返金の相談は、イベントの主催者か support@direct-cheers.com へ",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "rules.card-statement",
    minRole: "user",
    title: "カード明細の表示",
    sources: ["lib/statement-descriptor.ts"],
    body: [
      { type: "p", text: "カードの利用明細には、英字では「DC for」の後に応援先（アーティスト名や主催者名）が続く形で表示されます。日本のカード会社では、カナや漢字の名前で表示されることもあります。" },
      { type: "p", text: "身に覚えのない請求に見えるときは、イベントで応援した先の名前になっていないか確認してください。それでも分からない場合は support@direct-cheers.com へ。" },
    ],
  },
  {
    kind: "section",
    id: "rules.contact",
    minRole: "user",
    title: "問い合わせ先",
    sources: ["components/legal/law-document.tsx"],
    body: [
      { type: "p", text: "解決しないことは support@direct-cheers.com へ。オーガナイザー・アーティストは、担当エージェントにも相談できます。" },
    ],
  },

  // ── アーティスト以上（口座を持つ人） ──
  {
    kind: "section",
    id: "rules.hold-period",
    minRole: "artist",
    title: "売上がすぐ出金できない理由（留保期間）",
    sources: ["lib/terms.ts", "lib/payout-config.ts"],
    body: [
      { type: "p", text: "売上は決済から{{HOLD_PERIOD}}たつまで出金できません。不当な返金要求（チャージバック）への備えと、イベントが本当に開催されたかを照合する期間として、利用規約（第4条）で定めています。どんな理由でも、この期間を短くする（早く出金する）ことはできません。" },
      { type: "p", text: "出金のときは振込手数料¥{{TRANSFER_FEE}}が差し引かれます。決済から{{FEE_WAIVER_DAYS}}日を超えた分は、月{{FREE_POOL_MONTHLY_LIMIT}}回まで振込手数料が無料になります。" },
    ],
  },
  {
    kind: "section",
    id: "rules.chargeback",
    minRole: "artist",
    title: "チャージバック（支払い拒否）が起きたとき",
    sources: ["lib/terms.ts"],
    body: [
      {
        type: "ul",
        items: [
          "お客様がカード会社を通じて支払いを拒否すると、対象の売上は解決するまで凍結され、出金できなくなります",
          "事実確認と対応の責任は、原則としてオーガナイザーと紐付くアーティストにあります。運営は、決済会社への証拠提出などの異議申し立て手続きを代理・支援します",
          "こちらの正当性が認められれば、凍結されていた売上は口座に戻ります",
          "返金が確定して残高が足りなくなった場合は、その不足分を支払うか、次回以降の売上から差し引かれます（利用規約 第8条）",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "rules.account-terms",
    minRole: "artist",
    title: "口座を持つ人の主なルール（利用規約）",
    sources: ["lib/terms.ts"],
    body: [
      {
        type: "ul",
        items: [
          "決済用のQRコードを掲示できるのは、許可されたイベント会場の中と、運営が認めた公式のライブ配信画面の中だけです（第3条）",
          "アーティストが単独で独自の決済窓口を作ったり、私的に使ったりすることはできません（第3条）",
          "1年以上活動や決済の履歴がない口座は、閉鎖されることがあります（第6条）",
          "販売するコンテンツの著作権・肖像権などは、利用者が処理済みであることを保証します（第7条）",
          "規約の全文は「プロフィール」の利用規約から読めます",
        ],
      },
    ],
  },

  // ── オーガナイザー以上 ──
  {
    kind: "section",
    id: "rules.event-lifecycle",
    minRole: "organizer",
    title: "イベントの状態と、誰が進めるか",
    sources: [
      "app/api/events/create/route.ts",
      "app/api/events/[eventId]/request-review/route.ts",
      "app/api/events/[eventId]/approve/route.ts",
      "app/api/events/[eventId]/end/route.ts",
      "app/api/events/[eventId]/cancel/route.ts",
      "app/api/events/[eventId]/settle/route.ts",
      "lib/purchase-window.ts",
    ],
    body: [
      {
        type: "ul",
        items: [
          "**下書き**：作成直後の状態。お客様からは見えず、QRを作っても決済は受け付けません",
          "**承認待ち**：主催者が「エージェントに承認依頼を送る」を押した状態。担当エージェント（いなければ運営）に通知されます",
          "**公開済み**：担当エージェントか運営が承認した状態。自分がエージェントを兼ねるイベントは、運営しか承認できません",
          "**開催中 → 終了**：主催者が終了操作をするとイベントは終了になります",
          "**精算済み**：運営が開催証跡を確認して精算した状態。売上が確定し、配分が送金されます",
          "**中止申請中 → 中止**：公開済み・開催中のイベントは中止申請になり、担当エージェントか運営の承認で中止が確定します。下書き・承認待ちならその場で中止になります",
        ],
      },
      { type: "p", text: "下書き・中止・精算済みのイベントでは、QRがあっても決済を受け付けません。当日決済（チア・当日券など）は、イベント開始から終了{{POST_EVENT_GRACE_HOURS}}時間後まで受け付けます。前売りの入場チケットは、設定した販売期間の間だけ受け付けます。" },
    ],
  },
  {
    kind: "section",
    id: "rules.organizer-terms",
    minRole: "organizer",
    title: "オーガナイザーの主なルール（追加約款）",
    sources: ["lib/terms.ts"],
    body: [
      {
        type: "ul",
        items: [
          "自分のカードで自分のイベントに決済する（循環決済・自作自演）ことは、テストであっても禁止です。運営の事前の許可なく行うと不正利用とみなされます（第9条）",
          "決済を通すためだけの、実態のない架空イベントの作成は禁止です（第11条）",
          "やむを得ず中止するときは、速やかにDC上で中止手続きをしてください。手続きを怠ると口座凍結の対象になります（第12条）",
          "主催者都合の中止による返金の手数料と、すでにかかったシステム利用手数料は、オーガナイザーの負担です（第12条）",
          "イベント終了後は遅滞なく開催実績を提出してください。確認が取れない場合、全決済がお客様へ返金されることがあります（第13条）",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "rules.organizer-receipt",
    minRole: "organizer",
    title: "売上から差し引かれるもの",
    sources: ["components/legal/law-document.tsx", "lib/payout-config.ts"],
    body: [
      { type: "p", text: "お客様が払った金額から、決済手数料（クレジットカード等 3.96%）とシステム利用料10%が差し引かれた残りが、配分設定の比率に従って主催者・出演者に配られます。配分額は自動で計算され、あとから手で変えることはできません。" },
      { type: "p", text: "出金のときは、別に振込手数料¥{{TRANSFER_FEE}}がかかります（[[organizer.payout]]）。" },
    ],
  },
];
