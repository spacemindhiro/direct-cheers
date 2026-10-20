// チアリー(AI)の答え合わせ質問集。
//   expect：そのロールの人への答えに入っているべき事実（知識集の文言の一部）
//   forbid：そのロールの人に渡す知識に入っていてはいけない文言（上位ロール向け・内部情報）
// 今（P2）は「ロール別に組み立てた知識に、答えの根拠が入っているか／入ってはいけないものが無いか」を
// テストで確かめる（__tests__/unit/knowledge-qa.test.ts）。P6 では同じ質問を実際のAIに投げて、
// 答えに expect が含まれるかを確かめる。仕様を変えて答えが変わるときは、ここも一緒に直す。
import type { KnowledgeRole } from "./types";

export type QaCase = { id: string; role: KnowledgeRole; q: string; expect: string[]; forbid?: string[] };

// どのロールにも渡してはいけない内部情報（エージェント報酬の割合など）
export const GLOBAL_FORBIDDEN = ["50%", "二分の一", "agent_fee", "エージェント報酬の割合"];

const USER_FORBID = ["出金管理", "エビデンス提出", "代理で作れる", "口座開設の最終承認"];
const ARTIST_FORBID = ["エビデンス提出", "代理で作れる", "口座開設の最終承認"];
const ORGANIZER_FORBID = ["代理で作れる", "担当の引き継ぎ", "口座開設の最終承認"];
const AGENT_FORBID = ["口座開設の最終承認"];

export const QA_SET: QaCase[] = [
  // ── 一般ユーザー ──
  { id: "u01", role: "user", q: "Apple Payのボタンが出てこない", expect: ["アプリ内ブラウザ", "他のブラウザで開く"], forbid: USER_FORBID },
  { id: "u02", role: "user", q: "会員登録はどこでするの？", expect: ["専用の会員登録という手続きはありません"], forbid: USER_FORBID },
  { id: "u03", role: "user", q: "買ったチケットをキャンセルしたい", expect: ["5日前"], forbid: USER_FORBID },
  { id: "u04", role: "user", q: "イベントが中止になったらお金はどうなる？", expect: ["請求は発生しません"], forbid: USER_FORBID },
  { id: "u05", role: "user", q: "手数料は別にかかる？", expect: ["上乗せされることはありません"], forbid: USER_FORBID },
  { id: "u06", role: "user", q: "カード明細に知らない名前がある", expect: ["DC for"], forbid: USER_FORBID },
  { id: "u07", role: "user", q: "アーティストにメッセージを送りたい", expect: ["メッセージを送る"], forbid: USER_FORBID },
  { id: "u08", role: "user", q: "別のメールアドレスで応援してしまった", expect: ["応援履歴を統合"], forbid: USER_FORBID },
  { id: "u09", role: "user", q: "PCでもパスキーでログインしたい", expect: ["端末ごとに登録"], forbid: USER_FORBID },
  { id: "u10", role: "user", q: "入場のとき紙のチケットは要る？", expect: ["印刷は不要"], forbid: USER_FORBID },
  { id: "u11", role: "user", q: "問い合わせ先は？", expect: ["support@direct-cheers.com"], forbid: USER_FORBID },
  { id: "u12", role: "user", q: "Stripe Linkが登録できない", expect: ["携帯電話番号と氏名は必ず入力"], forbid: USER_FORBID },
  { id: "u13", role: "user", q: "決済後に返金してほしい", expect: ["お客様都合によるキャンセル・返金には応じていません"], forbid: USER_FORBID },

  // ── アーティスト ──
  { id: "a01", role: "artist", q: "出金はいつからできる？", expect: ["2週間（14日）"], forbid: ARTIST_FORBID },
  { id: "a02", role: "artist", q: "出金の手数料は？", expect: ["¥500"], forbid: ARTIST_FORBID },
  { id: "a03", role: "artist", q: "手数料なしで出金できる？", expect: ["120日", "月1回"], forbid: ARTIST_FORBID },
  { id: "a04", role: "artist", q: "自分専用のQRを作りたい", expect: ["常設QRはありません"], forbid: ARTIST_FORBID },
  { id: "a05", role: "artist", q: "口座登録したのに受取可能にならない", expect: ["最終審査"], forbid: ARTIST_FORBID },
  { id: "a06", role: "artist", q: "口座登録前に精算されたらお金はどうなる？", expect: ["失われることはありません"], forbid: ARTIST_FORBID },
  { id: "a07", role: "artist", q: "出金残高が凍結中になっている", expect: ["チャージバック", "凍結"], forbid: ARTIST_FORBID },
  { id: "a08", role: "artist", q: "急ぎでお金が要るので早く出金したい", expect: ["短くする（早く出金する）ことはできません"], forbid: ARTIST_FORBID },
  { id: "a09", role: "artist", q: "QRを自分のSNSに載せていい？", expect: ["イベント会場の中"], forbid: ARTIST_FORBID },

  // ── オーガナイザー ──
  { id: "o01", role: "organizer", q: "エビデンスの提出期限は？", expect: ["7日以内"], forbid: ORGANIZER_FORBID },
  { id: "o02", role: "organizer", q: "期限を過ぎたらどうなる？", expect: ["自動", "中止"], forbid: ORGANIZER_FORBID },
  { id: "o03", role: "organizer", q: "写真は何枚まで出せる？", expect: ["最大10枚"], forbid: ORGANIZER_FORBID },
  { id: "o04", role: "organizer", q: "イベントを作ったらすぐ公開される？", expect: ["下書き"], forbid: ORGANIZER_FORBID },
  { id: "o05", role: "organizer", q: "お客様に返金したい", expect: ["売上・決済", "精算済み"], forbid: ORGANIZER_FORBID },
  { id: "o06", role: "organizer", q: "イベントを中止したら前売り分は？", expect: ["自動的に取り消され"], forbid: ORGANIZER_FORBID },
  { id: "o07", role: "organizer", q: "自分のカードでテスト決済していい？", expect: ["循環決済"], forbid: ORGANIZER_FORBID },
  { id: "o08", role: "organizer", q: "自分がエージェントも兼ねている。自分で承認できる？", expect: ["運営"], forbid: ORGANIZER_FORBID },
  { id: "o09", role: "organizer", q: "口座登録がまだだけどQRは作れる？", expect: ["すべての決済がエラー"], forbid: ORGANIZER_FORBID },
  { id: "o10", role: "organizer", q: "未登録の人をアーティストとして招待したい", expect: ["有効期限30日"], forbid: ORGANIZER_FORBID },
  { id: "o11", role: "organizer", q: "イベントを作成しようとしたらエラーになる", expect: ["担当エージェントが決まっている必要"], forbid: ORGANIZER_FORBID },
  { id: "o12", role: "organizer", q: "売上から何が引かれる？", expect: ["システム利用料10%", "3.96%"], forbid: ORGANIZER_FORBID },
  { id: "o13", role: "organizer", q: "イベントが終わった後もチアは受け付ける？", expect: ["終了3時間後"], forbid: ORGANIZER_FORBID },
  { id: "o14", role: "organizer", q: "タッチ決済のカードリーダーが繋がらない", expect: ["QR自己決済に切り替えて続行"], forbid: ORGANIZER_FORBID },

  // ── エージェント ──
  { id: "g01", role: "agent", q: "代理で作った下書きは主催者に見えている？", expect: ["主催者からは見えません"], forbid: AGENT_FORBID },
  { id: "g02", role: "agent", q: "担当イベントをほかのエージェントに頼みたい", expect: ["「承認待ち」「公開済み」「開催中」"], forbid: AGENT_FORBID },
  { id: "g03", role: "agent", q: "自主開催のイベントを自分で承認したい", expect: ["運営の承認が必要"], forbid: AGENT_FORBID },
  { id: "g04", role: "agent", q: "代打したイベントの報酬は誰のもの？", expect: ["引き継ぎ先のエージェント"], forbid: AGENT_FORBID },
  { id: "g05", role: "agent", q: "主催者から中止申請が来た", expect: ["却下すると「公開済み」に戻ります"], forbid: AGENT_FORBID },
  { id: "g06", role: "agent", q: "オーソリ期限の警告が来た", expect: ["開催証跡の提出を促して"], forbid: AGENT_FORBID },

  // ── 運営 ──
  { id: "m01", role: "admin", q: "精算ボタンを押したらエラーになった", expect: ["未照合の決済"] },
  { id: "m02", role: "admin", q: "精算後に返金したい", expect: ["精算済みになった後の返金"] },
  { id: "m03", role: "admin", q: "口座開設を承認するのは誰？", expect: ["口座開設の最終承認"] },
];
