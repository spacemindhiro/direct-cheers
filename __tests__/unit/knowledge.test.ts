/**
 * TC-KNOWLEDGE: ヘルプ／チアリー(AI)共通の知識データ
 *
 * - 番号（①②…）と相互参照は並び順から自動で振る。手書きの番号が項目追加でずれた
 *   不具合（PR #178：⑨エントランスQR追加で「⑪参照」「⑩参照」がずれた）を構造的に起こさない
 * - 数字はコードの定数から差し込む
 * - AIに渡す知識はロール別に「渡さない」で制御する（admin ⊇ agent ⊇ organizer ⊇ artist ⊇ user）
 */
import { describe, it, expect } from "vitest";
import { KNOWLEDGE_ITEMS, helpSections, helpFaqs, helpTitle, helpNumber, refLabel } from "@/lib/knowledge";
import { expand, parseMarkup, toPlainText } from "@/lib/knowledge/markup";
import { KNOWLEDGE_CONSTANTS } from "@/lib/knowledge/constants";
import { itemsForRole, itemText, knowledgeTextForRole } from "@/lib/knowledge/assemble";
import { roleRank } from "@/lib/role-rank";
import { TUTORIAL_VIDEO_IDS } from "@/lib/tutorial-videos";
import { HOLD_DAYS, TRANSFER_FEE, FEE_WAIVER_DAYS, FREE_POOL_MONTHLY_LIMIT } from "@/lib/payout-config";
import { AUTH_EXPIRE_DAYS, AUTH_EXPIRE_WARN_DAYS_BEFORE } from "@/lib/settlement-deadline";
import type { KnowledgeItem, KnowledgeSection } from "@/lib/knowledge/types";

// 項目内のすべての文字列（記法を含みうるもの）
function textsOf(item: KnowledgeItem): string[] {
  if (item.kind === "faq") return [item.q, item.a];
  return item.body.flatMap((b) => {
    if (b.type === "p") return [b.text];
    if (b.type === "warn") return [b.title, b.text];
    return b.items;
  });
}

function section(id: string, over: Partial<KnowledgeSection> = {}): KnowledgeSection {
  return {
    kind: "section",
    id,
    minRole: "organizer",
    title: id,
    help: { tab: "organizer", group: "prep", icon: "Zap", subtitle: "S" },
    body: [{ type: "p", text: id }],
    ...over,
  };
}

describe("TC-KNOWLEDGE: データの整合", () => {
  it("IDが重複しない", () => {
    const ids = KNOWLEDGE_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("全項目の記法（定数・相互参照）が解決できる", () => {
    for (const item of KNOWLEDGE_ITEMS) for (const t of textsOf(item)) expect(() => expand(t)).not.toThrow();
  });

  it("ヘルプのタブと最低ロールが一致する（ヘルプの閲覧範囲とAIの開示範囲を揃える）", () => {
    for (const item of KNOWLEDGE_ITEMS) if (item.help) expect(`${item.id}:${item.minRole}`).toBe(`${item.id}:${item.help.tab}`);
  });

  it("参照先は参照元と同じかより下のロール向け（見えない項目を案内しない）", () => {
    for (const item of KNOWLEDGE_ITEMS) {
      for (const t of textsOf(item)) {
        for (const m of t.matchAll(/\[\[([a-z0-9.-]+)/g)) {
          const target = KNOWLEDGE_ITEMS.find((i) => i.id === m[1])!;
          expect(`${item.id}→${target.id}:${roleRank(target.minRole) <= roleRank(item.minRole)}`).toBe(`${item.id}→${target.id}:true`);
        }
      }
    }
  });

  it("動画キーはすべて lib/tutorial-videos.ts に存在する", () => {
    for (const item of KNOWLEDGE_ITEMS) {
      if (item.kind === "section" && item.help?.video) {
        expect(`${item.help.video}:${item.help.video in TUTORIAL_VIDEO_IDS}`).toBe(`${item.help.video}:true`);
      }
    }
  });
});

describe("TC-KNOWLEDGE: 自動採番と相互参照", () => {
  it("ヘルプの見出しが現行ヘルプと同じ番号・並びになる", () => {
    expect(helpSections("user").map((s) => helpTitle(s))).toEqual([
      "① 支払い方法の準備（いちばん大事）",
      "② Stripe Link にカードを登録する",
      "③ 会員登録・ログイン",
      "④ チアを送る・チケットを購入する",
      "⑤ メッセージ付きで応援する",
      "⑥ マイチケットの使い方",
      "⑦ カードコレクション・応援履歴",
      "⑧ アカウント設定",
    ]);
    expect(helpSections("artist").map((s) => helpTitle(s))).toEqual([
      "① 招待リンクから登録する",
      "② プロフィール設定",
      "③ 口座登録",
      "④ 出演依頼を受ける",
      "⑤ チアの受け取り方",
      "⑥ サンクス特典（お返し）を届ける",
      "⑦ 収益確認",
      "⑧ 出金",
      "⑨ 統計",
    ]);
    expect(helpSections("organizer", "prep").map((s) => helpTitle(s))).toEqual([
      "① 招待リンクから登録する",
      "② プロフィールを設定する",
      "③ 口座登録",
      "④ イベントを作成する",
      "⑤ 出演依頼",
      "⑥ 会員招待",
      "⑦ 公開の承認を依頼する",
      "⑧ QRを作成する（スタンダード／メッセージ）",
      "⑨ エントランスQRを作成する",
      "⑩ QRを印刷する",
      "⑪ サンクス特典（お返し）を設定する",
      "⑫ 売上を見る・決済を取り消す",
      "⑬ エビデンス提出",
      "⑭ 売上・精算の確認",
      "⑮ 出金",
      "⑯ イベントの中止",
    ]);
    expect(helpSections("organizer", "dayof").map((s) => helpTitle(s))).toEqual([
      "① 印刷したQRだけで運用する",
      "② 入場スキャナで検札する",
      "③ タッチ決済・子機/親機を使う",
      "④ 当日オペレーション（時系列）",
    ]);
    expect(helpFaqs("user").length).toBe(4);
    expect(helpFaqs("artist").length).toBe(3);
    expect(helpFaqs("organizer").length).toBe(4);
  });

  it("参照の3つの書き方", () => {
    expect(refLabel("organizer.lineup-invite", "title")).toBe("「⑤ 出演依頼」");
    expect(refLabel("organizer.dayof.print-only", "no")).toBe("①");
    expect(refLabel("organizer.evidence", "group")).toBe("準備・機能グループの⑬");
    expect(refLabel("organizer.sales-cancel", "group")).toBe("準備・機能グループの⑫");
    expect(refLabel("organizer.bank", "group")).toBe("準備・機能グループの③");
  });

  it("前に項目を1つ足すと、番号も参照も自動で繰り上がる（PR #178 の再発防止）", () => {
    const base = [section("a"), section("b"), section("target"), section("ref", { body: [{ type: "p", text: "[[target|group]]参照" }] })];
    expect(expand("[[target|group]]参照", base)).toBe("準備・機能グループの③参照");
    const inserted = [section("a"), section("new"), ...base.slice(1)];
    expect(expand("[[target|group]]参照", inserted)).toBe("準備・機能グループの④参照");
    expect(helpNumber("ref", inserted)).toBe("⑤");
  });

  it("壊れた参照は例外になる（ヘルプに出す前にテストで落とす）", () => {
    expect(() => expand("[[organizer.nope]]")).toThrow("知識データに存在しないID: organizer.nope");
    expect(() => expand("[[organizer.evidence|bad]]")).toThrow("知識データの参照の書き方が不正: [[organizer.evidence|bad]]");
    expect(() => expand("[[user.faq.merge]]")).toThrow("参照先が見出し項目ではない: user.faq.merge");
    // グループの無いタブへの |group 参照
    expect(() => expand("[[user.login|group]]")).toThrow("参照先にグループが無い: user.login");
    // ヘルプに載っていない項目への参照
    const hidden = [section("x", { help: undefined })];
    expect(() => expand("[[x]]", hidden)).toThrow("参照先がヘルプに載っていない: x");
  });
});

describe("TC-KNOWLEDGE: 定数の差し込み", () => {
  it("コードの定数と同じ値が入る", () => {
    expect(KNOWLEDGE_CONSTANTS.HOLD_PERIOD).toBe(`${HOLD_DAYS / 7}週間（${HOLD_DAYS}日）`);
    expect(KNOWLEDGE_CONSTANTS.HOLD_PERIOD).toBe("2週間（14日）");
    expect(KNOWLEDGE_CONSTANTS.TRANSFER_FEE).toBe(TRANSFER_FEE.toLocaleString("ja-JP"));
    expect(KNOWLEDGE_CONSTANTS.FEE_WAIVER_DAYS).toBe(String(FEE_WAIVER_DAYS));
    expect(KNOWLEDGE_CONSTANTS.FREE_POOL_MONTHLY_LIMIT).toBe(String(FREE_POOL_MONTHLY_LIMIT));
    expect(KNOWLEDGE_CONSTANTS.AUTH_EXPIRE_DAYS).toBe(String(AUTH_EXPIRE_DAYS));
    expect(KNOWLEDGE_CONSTANTS.AUTH_EXPIRE_WARN_DAY).toBe(String(AUTH_EXPIRE_DAYS - AUTH_EXPIRE_WARN_DAYS_BEFORE));
    expect(KNOWLEDGE_CONSTANTS.AUTH_EXPIRE_WARN_DAY).toBe("5");
  });

  it("未定義の定数は例外になる", () => {
    expect(() => expand("{{NOPE}}")).toThrow("知識データの未定義の定数: NOPE");
  });

  it("本文に差し込まれた結果（エビデンスの期限警告）", () => {
    expect(expand("提出・精算の期限はイベント開始から{{AUTH_EXPIRE_DAYS}}日以内です")).toBe(`提出・精算の期限はイベント開始から${AUTH_EXPIRE_DAYS}日以内です`);
  });
});

describe("TC-KNOWLEDGE: 記法の分解", () => {
  it("太字・強調・リンク・平文が順に分かれ、隣り合う平文は1つにまとまる", () => {
    expect(parseMarkup("A{{AUTH_EXPIRE_DAYS}}B**太**C==強==D[x@y.z](mailto:x@y.z)E")).toEqual([
      { t: "text", v: `A${AUTH_EXPIRE_DAYS}B` },
      { t: "b", v: "太" },
      { t: "text", v: "C" },
      { t: "hl", v: "強" },
      { t: "text", v: "D" },
      { t: "a", v: "x@y.z", href: "mailto:x@y.z" },
      { t: "text", v: "E" },
    ]);
  });

  it("記法の無い文字列は平文1つ・空文字は空配列", () => {
    expect(parseMarkup("ただの文")).toEqual([{ t: "text", v: "ただの文" }]);
    expect(parseMarkup("")).toEqual([]);
  });

  it("平文化：表示とURLが同じリンクは表示だけ、違えば括弧でURLを添える", () => {
    expect(toPlainText("[support@direct-cheers.com](mailto:support@direct-cheers.com)まで")).toBe("support@direct-cheers.comまで");
    expect(toPlainText("[こちら](https://example.com)")).toBe("こちら（https://example.com）");
    expect(toPlainText("**太字**と==強調==")).toBe("太字と強調");
  });
});

describe("TC-KNOWLEDGE: ロール別の組み立て（AIに渡す範囲）", () => {
  const idsFor = (role: string | null | undefined) => itemsForRole(role).map((i) => i.id);
  const byPrefix = (p: string) => KNOWLEDGE_ITEMS.filter((i) => i.id.startsWith(p)).map((i) => i.id);
  // AI専用の仕組み説明（rules.*）・スタッフ向け（staff.ts）の、ロールごとの期待値。並びは KNOWLEDGE_ITEMS の順
  const RULES_USER = ["rules.what-is-dc", "rules.price-and-fees", "rules.payment-timing", "rules.cancel-policy", "rules.card-statement", "rules.contact"];
  const RULES_ARTIST = ["rules.hold-period", "rules.chargeback", "rules.account-terms"];
  const RULES_ORGANIZER = ["rules.event-lifecycle", "rules.organizer-terms", "rules.organizer-receipt"];
  const AGENT = ["agent.role", "agent.approve", "agent.cancel-approve", "agent.proxy-draft", "agent.handoff", "agent.deadline-warning"];
  const USER_IDS = [...RULES_USER, ...byPrefix("user.")];
  const ARTIST_IDS = [...RULES_USER, ...RULES_ARTIST, ...byPrefix("user."), ...byPrefix("artist.")];
  const ORGANIZER_IDS = [...RULES_USER, ...RULES_ARTIST, ...RULES_ORGANIZER, ...byPrefix("user."), ...byPrefix("artist."), ...byPrefix("organizer.").filter((id) => id !== "organizer.needs-agent"), "organizer.needs-agent"];

  it("user は仕組み説明（全員向け）＋一般ユーザー向けだけ", () => {
    expect(idsFor("user")).toEqual(USER_IDS);
  });

  it("artist は user の範囲＋アーティスト向け", () => {
    expect(idsFor("artist")).toEqual(ARTIST_IDS);
  });

  it("organizer はエージェント・運営向けを含まない", () => {
    expect(idsFor("organizer")).toEqual(ORGANIZER_IDS);
  });

  it("agent は organizer の範囲＋エージェント向け、運営向けは含まない", () => {
    const expected = KNOWLEDGE_ITEMS.map((i) => i.id).filter((id) => [...ORGANIZER_IDS, ...AGENT].includes(id));
    expect(idsFor("agent")).toEqual(expected);
    expect(idsFor("agent").includes("admin.duties")).toBe(false);
  });

  it("admin は全項目", () => {
    expect(idsFor("admin")).toEqual(KNOWLEDGE_ITEMS.map((i) => i.id));
  });

  it("ロール不明・未設定は一番下（user）扱いにする", () => {
    expect(idsFor(null)).toEqual(USER_IDS);
    expect(idsFor(undefined)).toEqual(USER_IDS);
    expect(idsFor("superuser")).toEqual(USER_IDS);
  });

  it("user に渡す文書に、上位ロール向けの見出しが1つも含まれない", () => {
    const text = knowledgeTextForRole("user");
    const headings = text.split("\n").filter((l) => l.startsWith("### "));
    const upper = KNOWLEDGE_ITEMS.filter((i) => i.kind === "section" && i.minRole !== "user") as KnowledgeSection[];
    for (const s of upper) {
      const hit = headings.some((h) => h.startsWith(`### ${s.title}（`) || h.startsWith(`### ${s.title}〔`));
      expect(`${s.id}:${hit}`).toBe(`${s.id}:false`);
    }
    expect(text.includes("出金管理")).toBe(false);
    // 検査そのものが効いている：ヘルプに載らない上位ロール向け項目の見出しを混ぜたら検出する
    const staff = upper.find((s) => !s.help)!;
    const polluted = `${text}\n### ${staff.title}〔${staff.id}〕`.split("\n").filter((l) => l.startsWith("### "));
    expect(polluted.some((h) => h.startsWith(`### ${staff.title}〔`))).toBe(true);
  });

  it("exceptRoles に入れたロールには、上位でも渡さない", () => {
    const items: KnowledgeItem[] = [section("cheer", { minRole: "user", exceptRoles: ["admin"], help: undefined }), section("org")];
    expect(itemsForRole("admin", items).map((i) => i.id)).toEqual(["org"]);
    expect(itemsForRole("agent", items).map((i) => i.id)).toEqual(["cheer", "org"]);
    expect(itemsForRole("user", items).map((i) => i.id)).toEqual(["cheer"]);
  });

  it("AI向けの1項目の文面（見出し・ヘルプ上の場所・平文化）", () => {
    const evidence = KNOWLEDGE_ITEMS.find((i) => i.id === "organizer.evidence")!;
    expect(itemText(evidence)).toBe(
      [
        "### エビデンス提出（ヘルプ：オーガナイザー＞準備・機能 ⑬）〔organizer.evidence〕",
        "イベントの終了時刻の3時間後（当日決済の受付が終わる時刻）から、「開催証跡を提出して承認依頼する」で写真（最大10枚）・動員数・コメント（任意）を提出できます。",
        "- 提出できる時刻になると、オーガナイザーに「開催証跡を提出してください」、担当エージェントにフォローの依頼が、メールとダッシュボードのお知らせで届きます（決済のあったイベントのみ）",
        "- 提出しただけでは自動で精算されません。運営が証跡を確認したうえで精算処理が実行されます",
        "- 差し戻された場合はダッシュボードに通知が表示され、再提出できます",
        `⚠ 提出・精算の期限（売上のオーソリの期限）はイベント開始から${AUTH_EXPIRE_DAYS}日以内です`,
        `開始から${AUTH_EXPIRE_DAYS - AUTH_EXPIRE_WARN_DAYS_BEFORE}日目（期限の${AUTH_EXPIRE_WARN_DAYS_BEFORE}日前）になっても未提出の場合は、オーガナイザーと担当エージェントに、もう一度メールとお知らせが届きます。 ${AUTH_EXPIRE_DAYS}日を過ぎても精算が完了していない場合、システムが自動的にそのイベントの決済をすべて取り消し（カード決済はオーソリ取消、決済済みのものは返金）、イベント自体も「中止」扱いになります。 返金にかかった決済手数料はオーガナイザー負担として計上されるため、証跡提出と精算は早めに進めてください。`,
      ].join("\n"),
    );
    const faq = KNOWLEDGE_ITEMS.find((i) => i.id === "artist.faq.payout-when")!;
    expect(itemText(faq)).toBe(
      `### Q. 出金はいつからできますか？（ヘルプ：アーティスト＞よくある質問）〔artist.faq.payout-when〕\nA. 決済が行われてから2週間（14日）後に出金可能になります（振込手数料¥${TRANSFER_FEE}が差し引かれます）。「出金管理」で「◯月◯日以降に出金可能」と表示されます。`,
    );
  });

  it("時系列ブロックは【ラベル】＋箇条書き、参照は番号に解決される", () => {
    const checklist = KNOWLEDGE_ITEMS.find((i) => i.id === "organizer.dayof.checklist")!;
    const text = itemText(checklist);
    expect(text.split("\n").slice(0, 3)).toEqual([
      "### 当日オペレーション（時系列）（ヘルプ：オーガナイザー＞当日の運用 ④）〔organizer.dayof.checklist〕",
      "当日スタッフが手元で見る前提の、時間順のチェックリストです。①〜③の機能説明とあわせてご覧ください。",
      "【前日まで】",
    ]);
    expect(text.includes("（準備・機能グループの⑬参照）")).toBe(true);
    expect(text.includes("[[")).toBe(false);
    expect(text.includes("{{")).toBe(false);
  });
});

describe("TC-KNOWLEDGE: 要点（core）と詳細（detail）", () => {
  it("詳細の本文はシステムプロンプト用の知識に入らず、目次（ID と見出し）だけが入る", async () => {
    const { knowledgeTextForRole, fullKnowledgeTextForRole } = await import("@/lib/knowledge/assemble");
    const text = knowledgeTextForRole("organizer");
    expect(text.includes("### オーガナイザーの主なルール（追加約款）")).toBe(false);
    expect(text.includes("- rules.organizer-terms：オーガナイザーの主なルール（追加約款）（自分のカードでのテスト決済（循環決済）の禁止・")).toBe(true);
    expect(text.includes("## 詳細の目次（本文は knowledge_detail で ID を指定して読む）")).toBe(true);
    expect(fullKnowledgeTextForRole("organizer").includes("### オーガナイザーの主なルール（追加約款）")).toBe(true);
  });

  it("目次もロールで絞る（user の目次にオーガナイザー・エージェント向けの詳細は出ない）", async () => {
    const { detailIndexForRole } = await import("@/lib/knowledge/assemble");
    expect(detailIndexForRole("user")).toBe("");
    expect(detailIndexForRole("artist")).toBe("## 詳細の目次（本文は knowledge_detail で ID を指定して読む）\n- rules.account-terms：口座を持つ人の主なルール（利用規約）（QRを掲示できる場所（会場内と公式配信だけ。SNSなどは不可）・独自の決済窓口の禁止・休眠口座の閉鎖・コンテンツの権利）");
    expect(detailIndexForRole("organizer").includes("agent.role")).toBe(false);
    expect(detailIndexForRole("agent").includes("- agent.role：エージェントの役割")).toBe(true);
  });

  it("詳細を ID で読む：ロールに見せてよい項目だけ。上位ロール向けは ID を言い当てても読めない", async () => {
    const { knowledgeDetailForRole, itemText } = await import("@/lib/knowledge/assemble");
    const terms = KNOWLEDGE_ITEMS.find((i) => i.id === "rules.organizer-terms")!;
    expect(knowledgeDetailForRole("organizer", ["rules.organizer-terms"])).toBe(itemText(terms));
    expect(knowledgeDetailForRole("user", ["rules.organizer-terms"])).toBe("### rules.organizer-terms\n（この ID の項目はありません）");
    expect(knowledgeDetailForRole("organizer", ["agent.role"])).toBe("### agent.role\n（この ID の項目はありません）");
    expect(knowledgeDetailForRole("organizer", ["nope"])).toBe("### nope\n（この ID の項目はありません）");
  });
});
