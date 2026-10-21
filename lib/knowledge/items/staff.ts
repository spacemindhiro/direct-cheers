import type { KnowledgeItem } from "../types";

// エージェント・運営(admin)向け。ヘルプには載せず、チアリー(AI)だけが読む。
// エージェント報酬の割合など、知識集に書かない情報は rules.ts 冒頭を参照。
export const STAFF_ITEMS: KnowledgeItem[] = [
  {
    kind: "section",
    id: "agent.role",
    minRole: "agent",
    tier: "detail",
    indexHint: "エージェントの役割と義務（代理でできる業務・一次対応の義務・辞退や引き継ぎ・連帯責任・対面での約款確認）",
    title: "エージェントの役割",
    sources: ["lib/terms.ts"],
    body: [
      { type: "p", text: "エージェントは、担当するオーガナイザーとイベントを支える立場です。担当する興行では、QR作成・開催実績の提出・紛争対応などオーガナイザーの業務を代わりに行えます（エージェント向け追加約款 第14条）。" },
      {
        type: "ul",
        items: [
          "担当するオーガナイザーとイベントに、問い合わせ・トラブル対応・進行管理などの一次対応を十分かつ迅速に行う義務があります（第17条）",
          "自分で対応するのが難しくなったら、担当を辞退するか、対応できる別のエージェントに引き継ぎます（第18条）",
          "代理業務での不備・不正（架空イベント、エビデンス未提出など）は、オーガナイザーと連帯して責任を負います（第14条）",
          "エージェント向け追加約款は、運営立ち会いの対面での確認が必要です",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "agent.approve",
    minRole: "agent",
    goto: { href: "/dashboard/events", label: "イベント一覧を開く" },
    title: "イベント公開の承認（エージェント）",
    sources: ["app/api/events/[eventId]/approve/route.ts"],
    body: [
      { type: "p", text: "担当イベントの主催者が承認依頼を送ると、エージェントに通知が届きます。イベント詳細から承認すると「公開済み」になります。" },
      {
        type: "ul",
        items: [
          "承認できるのは「承認待ち」のイベントで、自分が担当になっているものだけです",
          "自分が主催者を兼ねるイベント（自主開催）は、自分では承認できず、運営の承認が必要です",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "agent.cancel-approve",
    minRole: "agent",
    goto: { href: "/dashboard/events", label: "イベント一覧を開く" },
    title: "中止申請の承認・却下（エージェント）",
    sources: ["app/api/events/[eventId]/cancel/route.ts"],
    body: [
      { type: "p", text: "公開済み・開催中のイベントで主催者が中止申請をすると、担当エージェントに通知が届きます。承認すると中止が確定し、まだキャプチャされていないカード決済（オーソリ中のもの）は自動で取り消されます。却下すると「公開済み」に戻ります。" },
      { type: "p", text: "承認・却下できるのは、自分が担当しているイベントだけです。" },
    ],
  },
  {
    kind: "section",
    id: "agent.proxy-draft",
    minRole: "agent",
    goto: { href: "/dashboard/events/create", label: "イベント作成を開く" },
    title: "主催者の代わりにイベントを下書きする",
    sources: ["app/api/events/create/route.ts", "app/api/events/[eventId]/proxy-notify/route.ts", "lib/proxy-draft.ts"],
    body: [
      { type: "p", text: "エージェントは、自分が担当しているオーガナイザーの名義で、イベントの下書きを作れます。" },
      {
        type: "ul",
        items: [
          "作った下書きは、「主催者に確認を依頼」を押すまで主催者からは見えません",
          "「主催者に確認を依頼」を押すと主催者に届き、内容を確認した主催者が自分で承認依頼を送ります",
          "下書きの間に選んだ出演者は「依頼予定」で、出演依頼はまだ届いていません",
          "代理で作れるのは、自分が担当エージェントになっているオーガナイザーの分だけです",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "agent.handoff",
    minRole: "agent",
    goto: { href: "/dashboard/events", label: "イベント一覧を開く" },
    title: "担当の引き継ぎ（代打）",
    sources: ["app/api/events/[eventId]/handoff/route.ts", "lib/terms.ts"],
    body: [
      { type: "p", text: "都合で対応できないイベントは、ほかのエージェントに担当を依頼できます。相手が引き受けると、そのイベントの担当が替わります。" },
      {
        type: "ul",
        items: [
          "依頼できるのは「承認待ち」「公開済み」「開催中」のイベントです",
          "自分が主催者を兼ねる自主開催のイベントは、依頼できません",
          "1つのイベントに同時に出せる依頼は1件までです",
          "引き継いだイベントの報酬を受け取る権利は、実際に対応した引き継ぎ先のエージェントに移ります（エージェント向け追加約款 第18条）",
        ],
      },
    ],
  },
  {
    kind: "section",
    id: "agent.deadline-warning",
    minRole: "agent",
    goto: { href: "/dashboard/events", label: "イベント一覧を開く" },
    title: "精算期限の警告が届いたとき",
    sources: ["app/api/admin/check-auth-expiry/route.ts", "lib/settlement-deadline.ts"],
    body: [
      { type: "p", text: "担当イベントが開始から{{AUTH_EXPIRE_WARN_DAY}}日目になっても精算が終わっていないと、「オーソリ期限が迫っています」の警告が届きます。{{AUTH_EXPIRE_DAYS}}日を過ぎると決済がすべて自動で取り消され、イベントは中止扱いになります（[[organizer.evidence]]）。" },
      { type: "p", text: "主催者に開催証跡の提出を促してください。" },
    ],
  },
  {
    kind: "section",
    id: "organizer.needs-agent",
    minRole: "organizer",
    title: "イベントを作るには担当エージェントが必要",
    sources: ["app/api/events/create/route.ts"],
    body: [
      { type: "p", text: "オーガナイザーがイベントを作成するには、担当エージェントが決まっている必要があります。担当がいない状態では作成できないので、運営（support@direct-cheers.com）に相談してください。" },
    ],
  },
  {
    kind: "section",
    id: "admin.duties",
    minRole: "admin",
    goto: { href: "/admin/settlements", label: "Settlements を開く" },
    title: "運営（admin）だけが行う操作",
    sources: [
      "app/api/events/[eventId]/settle/route.ts",
      "app/api/events/[eventId]/evidence/reject/route.ts",
      "app/api/admin/users/[profileId]/approve/route.ts",
      "app/api/admin/refund/route.ts",
      "app/api/events/[eventId]/approve/route.ts",
      "components/admin-nav.tsx",
      "app/[locale]/admin/settlements/page.tsx",
    ],
    body: [
      {
        type: "ul",
        items: [
          "口座開設の最終承認（Stripeでの本人確認が終わった人を受取可能にする）：管理画面の「口座審査」",
          "開催証跡の確認と精算：管理画面の「Settlements」（精算管理）。証跡が無いイベントや、未照合の決済が残っているイベントは精算できません。未照合の決済は「Reconcile」（照合管理）で照合します",
          "開催証跡の差し戻し（コメント必須）：「Settlements」（精算管理）から",
          "精算済みになった後の返金：管理画面の「Refunds」（返金管理）",
          "エージェントが主催者を兼ねるイベント（自主開催）の公開承認：そのイベントの詳細画面から",
        ],
      },
      { type: "p", text: "運営は DC を運営している本人なので、support@direct-cheers.com（運営自身の窓口）を案内する必要はありません。" },
    ],
  },
];
