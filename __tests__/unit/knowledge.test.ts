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
      "⑥ 収益確認",
      "⑦ 出金",
      "⑧ 統計",
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
      "⑪ 売上を見る・決済を取り消す",
      "⑫ エビデンス提出",
      "⑬ 売上・精算の確認",
      "⑭ 出金",
      "⑮ イベントの中止",
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
    expect(refLabel("organizer.evidence", "group")).toBe("準備・機能グループの⑫");
    expect(refLabel("organizer.sales-cancel", "group")).toBe("準備・機能グループの⑪");
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

  it("user は一般ユーザー向けだけ", () => {
    expect(idsFor("user")).toEqual(byPrefix("user."));
  });

  it("artist は一般ユーザー＋アーティスト", () => {
    expect(idsFor("artist")).toEqual([...byPrefix("user."), ...byPrefix("artist.")]);
  });

  it("organizer・agent・admin は全項目（上位互換）", () => {
    const all = KNOWLEDGE_ITEMS.map((i) => i.id);
    expect(idsFor("organizer")).toEqual(all);
    expect(idsFor("agent")).toEqual(all);
    expect(idsFor("admin")).toEqual(all);
  });

  it("ロール不明・未設定は一番下（user）扱いにする", () => {
    expect(idsFor(null)).toEqual(byPrefix("user."));
    expect(idsFor(undefined)).toEqual(byPrefix("user."));
    expect(idsFor("superuser")).toEqual(byPrefix("user."));
  });

  it("user に渡す文書に、上位ロール向けの見出しが1つも含まれない", () => {
    const text = knowledgeTextForRole("user");
    const upper = KNOWLEDGE_ITEMS.filter((i) => i.kind === "section" && i.minRole !== "user") as KnowledgeSection[];
    for (const s of upper) expect(`${s.id}:${text.includes(`### ${s.title}（`)}`).toBe(`${s.id}:false`);
    expect(text.includes("出金管理")).toBe(false);
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
        "### エビデンス提出（ヘルプ：オーガナイザー＞準備・機能 ⑫）",
        "イベント終了後、「開催証跡を提出して承認依頼する」から、写真（最大10枚）・動員数・コメント（任意）を提出します。",
        "- 提出しただけでは自動で精算されません。運営が証跡を確認したうえで精算処理が実行されます",
        "- 差し戻された場合はダッシュボードに通知が表示され、再提出できます",
        `⚠ 提出・精算の期限はイベント開始から${AUTH_EXPIRE_DAYS}日以内です`,
        `開始から${AUTH_EXPIRE_DAYS - AUTH_EXPIRE_WARN_DAYS_BEFORE}日目（期限の${AUTH_EXPIRE_WARN_DAYS_BEFORE}日前）に、担当エージェントへ「オーソリ期限が迫っています」の警告通知が届きます。 ${AUTH_EXPIRE_DAYS}日を過ぎても精算が完了していない場合、システムが自動的にそのイベントの決済をすべて取り消し（カード決済はオーソリ取消、決済済みのものは返金）、イベント自体も「中止」扱いになります。 返金にかかった決済手数料はオーガナイザー負担として計上されるため、証跡提出と精算は早めに進めてください。`,
      ].join("\n"),
    );
    const faq = KNOWLEDGE_ITEMS.find((i) => i.id === "artist.faq.payout-when")!;
    expect(itemText(faq)).toBe(
      `### Q. 出金はいつからできますか？（ヘルプ：アーティスト＞よくある質問）\nA. 決済が行われてから2週間（14日）後に出金可能になります（振込手数料¥${TRANSFER_FEE}が差し引かれます）。「出金管理」で「◯月◯日以降に出金可能」と表示されます。`,
    );
  });

  it("時系列ブロックは【ラベル】＋箇条書き、参照は番号に解決される", () => {
    const checklist = KNOWLEDGE_ITEMS.find((i) => i.id === "organizer.dayof.checklist")!;
    const text = itemText(checklist);
    expect(text.split("\n").slice(0, 3)).toEqual([
      "### 当日オペレーション（時系列）（ヘルプ：オーガナイザー＞当日の運用 ④）",
      "当日スタッフが手元で見る前提の、時間順のチェックリストです。①〜③の機能説明とあわせてご覧ください。",
      "【前日まで】",
    ]);
    expect(text.includes("（準備・機能グループの⑫参照）")).toBe(true);
    expect(text.includes("[[")).toBe(false);
    expect(text.includes("{{")).toBe(false);
  });
});
