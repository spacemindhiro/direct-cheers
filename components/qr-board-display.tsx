"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Wifi, WifiOff, Lock, X, Smartphone, Sparkles, ChevronDown } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { PasskeySetup } from "@/components/passkey-setup";
import { resolveCheerCardIdentity, type RecipientNameContext } from "@/lib/statement-descriptor";

type QRState = {
  qr_config_id: string;
  qr_url: string;
  product_name: string;
  label?: string;
  artist_name?: string;
  artist_avatar_url?: string | null;
};

type QrConfigInfo = {
  qr_config_id: string;
  label: string | null;
  image_url: string | null;
  recipient_profile_id: string | null;
  recipient_name_context: RecipientNameContext | null;
  product: {
    name: string;
    type: string;
    artist: { display_name: string; artist_name: string | null; avatar_url: string | null } | null;
  } | null;
  recipient: {
    display_name: string | null;
    avatar_url: string | null;
    artist_name: string | null;
    organizer_name: string | null;
    artist_avatar_url: string | null;
    organizer_avatar_url: string | null;
  } | null;
} | null;

type QrGroupInfo = {
  qr_group_id: string;
  name: string;
  members: QrConfigInfo[];
} | null;

// 現在表示すべき対象を「単一QR」か「名前付きグループ」かに関わらず統一的に扱うための型。
// スケジュールスロット・トラックのデフォルト・強制表示のいずれから来ても同じ形に解決する。
type ResolvedTarget =
  | { type: "single"; qrState: QRState }
  | { type: "group"; list: QRState[]; groupId: string }
  | null;

type DisplaySchedule = {
  schedule_id: string;
  qr_config_id: string | null;
  qr_group_id: string | null;
  track_id: string | null;
  start_at: string;
  end_at: string;
  label: string | null;
  qr_config: QrConfigInfo;
  qr_group: QrGroupInfo;
};

// タイムテーブルから現在時刻に該当するスロットを返す
function getActiveSchedule(schedules: DisplaySchedule[], now: Date): DisplaySchedule | null {
  return schedules.find(s =>
    new Date(s.start_at) <= now && now < new Date(s.end_at)
  ) ?? null;
}

// qr_config情報からQR表示状態を構築（タイムテーブルスロット・トラックのデフォルトQR共通）。
// 名前・画像は「チアカード（/c/[qrConfigId]）」が使うのと同じ優先順位ロジック
// （recipient_name_contextに応じたorganizer/artist名義 → product.artist → 未設定）で解決する。
// 複数QRの選択タイルで見分けが付くようにするための画像なので、全QRでほぼ同じになりがちな
// qr_configs.image_url（チアカード自体の画像）ではなく、宛先本人の写真を使うのが基本。
// ただしエントランス・カスタム（バウチャー/ドリンクチケット）は同一主催者配下で
// 宛先（オーガナイザー）画像が使い回されがちで、グループ一覧に並べると見分けが
// つかず味気なくなるため、QR自体に個別画像が設定されていればそちらを優先する。
function qrConfigToState(qc: QrConfigInfo, siteUrl: string, overrideLabel?: string | null): QRState | null {
  if (!qc) return null;
  const { name: artistName, avatarUrl: artistAvatarUrl } = resolveCheerCardIdentity({
    recipientNameContext: qc.recipient_name_context ?? "artist",
    recipient: qc.recipient
      ? {
          organizerName: qc.recipient.organizer_name,
          artistName: qc.recipient.artist_name,
          displayName: qc.recipient.display_name,
          organizerAvatarUrl: qc.recipient.organizer_avatar_url,
          artistAvatarUrl: qc.recipient.artist_avatar_url,
          avatarUrl: qc.recipient.avatar_url,
        }
      : null,
    productArtist: qc.product?.artist
      ? {
          artistName: qc.product.artist.artist_name,
          displayName: qc.product.artist.display_name,
          avatarUrl: qc.product.artist.avatar_url,
        }
      : null,
    fallbackName: "",
  });
  const isTicketType = qc.product?.type === "entrance" || qc.product?.type === "custom";
  const tileImageUrl = (isTicketType && qc.image_url) ? qc.image_url : artistAvatarUrl;
  return {
    qr_config_id: qc.qr_config_id,
    qr_url: `${siteUrl}/c/${qc.qr_config_id}`,
    product_name: qc.product?.name ?? "",
    label: overrideLabel ?? qc.label ?? qc.product?.name ?? "",
    artist_name: artistName,
    artist_avatar_url: tileImageUrl,
  };
}

// グループ表示（一覧タップ→単体QR拡大）で一覧に自動で戻るまでの時間
const GROUP_RETURN_MS = 60_000;

// localStorageの復元値・Realtimeブロードキャストのpayloadは実行時には型保証が無いため、
// qr_config_idを持つ妥当な形かどうかを検証してから使う。
// (過去バージョンで保存された形の異なるキャッシュが残っていると、qrState.qr_config_id.slice()が
//  undefinedに対して呼ばれてクラッシュする実害があったため)
function isValidQrState(value: unknown): value is QRState {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { qr_config_id?: unknown }).qr_config_id === "string" &&
    (value as { qr_config_id: string }).qr_config_id.length > 0
  );
}

type FloatingHeart = {
  id: string;
  x: number;       // vw%
  size: number;     // rem
  duration: number; // ms
  delay: number;    // ms
  color: string;
};

type FloatingText = {
  id: string;
  text: string;
  x: number;        // vw%
  y: number;        // vh%
  size: number;     // rem
  duration: number; // ms
  delay: number;    // ms
  color: string;
};

const HEART_COLORS = ["#ff6b9d", "#ff4081", "#f06292", "#e91e63", "#ff8a80", "#ff1744", "#ffd54f", "#ff9e80"];
const CHEER_TEXTS = ["Thank you!", "Cheers!"];
const TEXT_COLORS = ["#ff4081", "#ffd54f", "#ffffff", "#69f0ae", "#40c4ff"];
const SURGE_WINDOW_MS = 10_000;
const SURGE_THRESHOLD = 5;
// チア受信後、約15秒間ハート・テキストを波状に追加し続けて演出を盛り上げる
const CELEBRATION_DURATION_MS = 15_000;
const CELEBRATION_INTERVAL_MS = 650;

const STORAGE_KEY   = (id: string) => `qr-display:${id}`;
const DEVICE_ID_KEY  = "qr-display-device-id";
const DEVICE_NAME_KEY = "qr-display-device-name";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// 端末IDは機材マスタ（equipment_devices）のサーバー発行IDを正とする。
// ここで生成するのはハンドシェイク前・オフライン時の仮IDのみで、
// ハンドシェイク成功時にマスタのIDで上書き保存される。
// ※かつては端末名のハッシュをIDにしていたが、名前変更のたびに別端末として
//   二重登録される根本原因だったため廃止した。
function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) { id = generateUUID(); localStorage.setItem(DEVICE_ID_KEY, id); }
  return id;
}

function detectDeviceType(): string {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android" : "Androidタブ";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "端末";
}

async function getBatteryLevel(): Promise<number | null> {
  try {
    if ("getBattery" in navigator) {
      const b = await (navigator as any).getBattery();
      return Math.round(b.level * 100);
    }
  } catch {}
  return null;
}

export function QRBoardDisplay({
  eventId,
  eventTitle,
  userEmail,
}: {
  eventId: string;
  eventTitle: string;
  userEmail?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [qrState, setQrState] = useState<QRState | null>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY(eventId));
      if (!s) return null;
      const parsed = JSON.parse(s);
      return isValidQrState(parsed) ? parsed : null;
    } catch { return null; }
  });
  const [flash, setFlash] = useState(false);
  const [connected, setConnected] = useState(false);
  // CHANNEL_ERROR/TIMED_OUT/CLOSED後の再接続トリガー。インクリメントすると
  // チャンネル購読useEffectが再実行され、チャンネルを作り直して再購読する。
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // タイムテーブル
  const [schedules, setSchedules] = useState<DisplaySchedule[]>([]);
  const [isForcedOverride, setIsForcedOverride] = useState(false);
  // 現在アクティブなグループの中身。スロット・トラックのデフォルト・強制表示のいずれから
  // 来たかに関わらず、グループが解決されたらここにセットする。
  // groupMode=true かつ qrState=null ならタイル一覧を表示し、客がタップした1件だけ拡大表示する
  const [groupList, setGroupList] = useState<QRState[]>([]);
  const [groupMode, setGroupMode] = useState(false);
  const schedulesRef = useRef<DisplaySchedule[]>([]);
  const isForcedRef  = useRef(false);
  const trackIdRef   = useRef<string | null>(null);
  // トラックのデフォルト表示(スロット外の時間に使うフォールバック)。単一QR or グループのどちらか
  const trackDefaultRef = useRef<ResolvedTarget>(null);
  const groupReturnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 直近に適用したグループのID。単一QR強制表示中にたまたま同じqr_config_idが
  // 別グループのメンバーにも含まれているだけで「既に選択中」と誤判定し、
  // 新しいグループへの切り替えが効かなくなる不具合があったため、
  // 「本当に同じグループの再適用か」をIDで厳密に区別する
  const activeGroupIdRef = useRef<string | null>(null);
  const siteUrlRef   = useRef(typeof window !== "undefined" ? window.location.origin : "");
  const qrStateRef   = useRef<QRState | null>(null);
  const [deviceName, setDeviceName] = useState(() => {
    try {
      // ?device_name=DJ-01 のようなURLパラメーターで端末名を指定・上書き保存
      const urlName = searchParams.get("device_name");
      if (urlName) {
        localStorage.setItem(DEVICE_NAME_KEY, urlName);
        return urlName;
      }
      const stored = localStorage.getItem(DEVICE_NAME_KEY);
      if (stored) return stored;
      const type = detectDeviceType();
      const name = `${type}-${getOrCreateDeviceId().slice(0, 4).toUpperCase()}`;
      localStorage.setItem(DEVICE_NAME_KEY, name);
      return name;
    } catch { return "端末-????"; }
  });
  // 機材マスタのdevice_id。ハンドシェイク成功でマスタの正準IDに確定する。
  // それまではlocalStorageの保存値（またはオフライン用の仮ID）で動く。
  const [masterDeviceId, setMasterDeviceId] = useState<string | null>(() => {
    try {
      return searchParams.get("device_id") || localStorage.getItem(DEVICE_ID_KEY);
    } catch { return null; }
  });

  // ロック解除モーダル
  const [showUnlock, setShowUnlock] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);

  // 端末名（識別名）設定
  const [nameInput, setNameInput] = useState(deviceName);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // 起動時ハンドシェイク: 機材マスタと同期し、正準のID・表示名を取得する。
  // localStorageが消えた端末も、URLの?device_id=や名前一致で同じ機材として復元される。
  useEffect(() => {
    let cancelled = false;
    let storedId: string | null = null;
    let urlId: string | null = null;
    try {
      urlId = searchParams.get("device_id");
      storedId = localStorage.getItem(DEVICE_ID_KEY);
    } catch {}
    fetch("/api/equipment-devices/handshake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: urlId || storedId || null, fallback_name: deviceName }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { device_id: string; display_name: string } | null) => {
        if (!d?.device_id || cancelled) return;
        try {
          localStorage.setItem(DEVICE_ID_KEY, d.device_id);
          localStorage.setItem(DEVICE_NAME_KEY, d.display_name);
        } catch {}
        setMasterDeviceId(d.device_id);
        setDeviceName(d.display_name);
        setNameInput(d.display_name);
      })
      .catch(() => {
        // オフライン等でもローカルの仮IDで動作継続（次回起動時に再同期）
        if (!cancelled && !masterDeviceId) {
          try { setMasterDeviceId(getOrCreateDeviceId()); } catch {}
        }
      });
    return () => { cancelled = true; };
    // 起動時に一度だけ実行する（deviceName等の後続変化で再ハンドシェイクしない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // チア演出
  const [cheerCount, setCheerCount] = useState(0);
  const [hearts, setHearts]         = useState<FloatingHeart[]>([]);
  const [texts, setTexts]           = useState<FloatingText[]>([]);
  const [surgeGlow, setSurgeGlow]   = useState(false);
  const [counterPulse, setCounterPulse] = useState(false);
  const recentCheersRef    = useRef<number[]>([]);
  const surgeTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counterPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrationEndRef  = useRef<number>(0);
  const celebrationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSurgeRef         = useRef(false);
  const pendingCheerCountRef = useRef(0);
  const lastRealtimeRef    = useRef<number>(0);    // last Realtime cheer timestamp
  const lastPolledCountRef = useRef<number>(0);    // server count at last poll

  const [qrSize, setQrSize] = useState(320);

  // dtab d-41Aのような低スペック端末では、グループ一覧タイルの写真を同時に
  // 何枚もデコードするとメモリ不足でタブごと落ちる懸念があるため、
  // Device Memory API(Chrome/Android系のみ対応)で低メモリ端末を検知した場合は
  // 写真を読み込まずアイコン表示に切り替える(動くことを最優先する安全策)
  const isLowMemoryDevice = useRef(
    typeof navigator !== "undefined" && (navigator as { deviceMemory?: number }).deviceMemory !== undefined
      && (navigator as { deviceMemory?: number }).deviceMemory! <= 2
  ).current;

  // タッチ決済（Case④）完了時のサインアップ用QRオーバーレイ
  const [touchpaySignup, setTouchpaySignup] = useState<{ ticketId: string; quantity: number } | null>(null);
  const signupCanvasRef = useRef<HTMLCanvasElement>(null);

  // グループ一覧（タイル）のスクロール状態。下にまだタイルがあることを
  // 見切れ表示＋フェード矢印で明示するため、スクロール位置を監視する
  const groupListScrollRef = useRef<HTMLDivElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  const checkScrollBottom = useCallback(() => {
    const el = groupListScrollRef.current;
    if (!el) { setHasMoreBelow(false); return; }
    setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 24);
  }, []);

  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const holdTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef   = useRef<number>(0);

  // ハート生成
  const spawnHearts = useCallback((isSurge: boolean) => {
    const count = isSurge ? 55 : 16;
    const newHearts: FloatingHeart[] = Array.from({ length: count }, (_, i) => ({
      id: `${Date.now()}-${i}-${Math.random()}`,
      x: 3 + Math.random() * 94,
      size: isSurge ? 5 + Math.random() * 5 : 3 + Math.random() * 3,
      duration: isSurge ? 1800 + Math.random() * 1200 : 2600 + Math.random() * 1800,
      delay: isSurge ? Math.random() * 700 : Math.random() * 300,
      color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
    }));
    setHearts((prev) => [...prev, ...newHearts]);
    const maxDuration = Math.max(...newHearts.map((h) => h.duration + h.delay)) + 500;
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => !newHearts.some((nh) => nh.id === h.id)));
    }, maxDuration);
  }, []);

  // 「Thank you! / Cheers!」テキストポップ生成
  const spawnTexts = useCallback((isSurge: boolean) => {
    const count = isSurge ? 4 : 2;
    const newTexts: FloatingText[] = Array.from({ length: count }, (_, i) => ({
      id: `${Date.now()}-t${i}-${Math.random()}`,
      text: CHEER_TEXTS[Math.floor(Math.random() * CHEER_TEXTS.length)],
      x: 10 + Math.random() * 80,
      y: 18 + Math.random() * 45,
      size: 2.2 + Math.random() * 1.8,
      duration: 1500 + Math.random() * 700,
      delay: Math.random() * 400,
      color: TEXT_COLORS[Math.floor(Math.random() * TEXT_COLORS.length)],
    }));
    setTexts((prev) => [...prev, ...newTexts]);
    const maxDuration = Math.max(...newTexts.map((t) => t.duration + t.delay)) + 300;
    setTimeout(() => {
      setTexts((prev) => prev.filter((t) => !newTexts.some((nt) => nt.id === t.id)));
    }, maxDuration);
  }, []);

  // チア受信ハンドラ
  const onCheerNew = useCallback((fromRealtime = true) => {
    const now = Date.now();
    if (fromRealtime) lastRealtimeRef.current = now;
    recentCheersRef.current = [
      ...recentCheersRef.current.filter((t) => now - t < SURGE_WINDOW_MS),
      now,
    ];
    const isSurge = recentCheersRef.current.length >= SURGE_THRESHOLD;
    isSurgeRef.current = isSurge;

    pendingCheerCountRef.current += 1;
    spawnHearts(isSurge);
    spawnTexts(isSurge);

    if (isSurge) {
      setSurgeGlow(true);
      if (surgeTimerRef.current) clearTimeout(surgeTimerRef.current);
      surgeTimerRef.current = setTimeout(() => setSurgeGlow(false), 3000);
    }

    // 約15秒間、波状にハート・テキストを追加し続けて演出を盛り上げ、
    // 終了タイミングでまとめて「キラーン」カウントアップする
    celebrationEndRef.current = now + CELEBRATION_DURATION_MS;
    if (!celebrationTimerRef.current) {
      celebrationTimerRef.current = setInterval(() => {
        if (Date.now() >= celebrationEndRef.current) {
          if (celebrationTimerRef.current) clearInterval(celebrationTimerRef.current);
          celebrationTimerRef.current = null;
          if (pendingCheerCountRef.current > 0) {
            setCheerCount((c) => c + pendingCheerCountRef.current);
            pendingCheerCountRef.current = 0;
            setCounterPulse(true);
            if (counterPulseTimerRef.current) clearTimeout(counterPulseTimerRef.current);
            counterPulseTimerRef.current = setTimeout(() => setCounterPulse(false), 700);
          }
          return;
        }
        spawnHearts(isSurgeRef.current);
        spawnTexts(isSurgeRef.current);
      }, CELEBRATION_INTERVAL_MS);
    }
  }, [spawnHearts, spawnTexts]);

  // グループ一覧に戻すヘルパー(タイマー解除込み)
  const clearGroupReturnTimer = useCallback(() => {
    if (groupReturnTimerRef.current) { clearTimeout(groupReturnTimerRef.current); groupReturnTimerRef.current = null; }
  }, []);

  // 単一QRを表示する(スロット・トラックのデフォルト・強制表示のいずれでも共通)
  const applySingle = useCallback((next: QRState) => {
    activeGroupIdRef.current = null;
    setGroupMode(false);
    clearGroupReturnTimer();
    setQrState(prev => {
      if (prev?.qr_config_id === next.qr_config_id) return prev;
      setFlash(true);
      setTimeout(() => setFlash(false), 350);
      try { localStorage.setItem(STORAGE_KEY(eventId), JSON.stringify(next)); } catch {}
      return next;
    });
  }, [eventId, clearGroupReturnTimer]);

  // グループを表示する(スロット・トラックのデフォルト・強制表示のいずれでも共通)。
  // 既に「同じグループ」の1件を選択中(拡大表示中)ならその選択状態を維持する。
  // 単にqr_config_idがメンバーに含まれるかどうかだけで判定すると、単一QR強制表示や
  // 別グループでたまたま同じQRを表示していた場合にも「選択維持」と誤判定し、
  // 新しいグループへの切り替え(一覧表示)が効かなくなるため、グループID自体を比較する
  const applyGroup = useCallback((list: QRState[], groupId: string) => {
    const sameGroup = activeGroupIdRef.current === groupId;
    activeGroupIdRef.current = groupId;
    setGroupMode(true);
    setGroupList(list);
    setQrState(prev => (sameGroup && prev && list.some(q => q.qr_config_id === prev.qr_config_id)) ? prev : null);
  }, []);

  const applyEmpty = useCallback(() => {
    activeGroupIdRef.current = null;
    setGroupMode(false);
    setQrState(prev => {
      if (prev === null) return prev;
      setFlash(true);
      setTimeout(() => setFlash(false), 350);
      return null;
    });
  }, []);

  // タイムテーブルの現在スロットを適用。
  //   1. スケジュールが有効なスロット中 → そのスロットの単一QR or グループを表示（最優先）
  //   2. スロット外で、トラックのデフォルトが単一QR → 従来通り単一QR表示
  //   3. スロット外で、トラックのデフォルトがグループ → グループモード（一覧タップ→拡大表示）
  //   4. どちらも無ければ「親機からの指示を待機中」の空表示
  const applySchedule = useCallback((scheds: DisplaySchedule[]) => {
    if (isForcedRef.current) return;
    const now = new Date();
    const active = getActiveSchedule(scheds, now);

    if (active?.qr_group) {
      const list = active.qr_group.members
        .map((qc) => qrConfigToState(qc, siteUrlRef.current))
        .filter((q): q is QRState => q !== null);
      applyGroup(list, active.qr_group.qr_group_id);
      return;
    }
    if (active?.qr_config) {
      const next = qrConfigToState(active.qr_config, siteUrlRef.current, active.label ?? active.qr_config.label ?? active.qr_config.product?.name ?? "");
      if (next) { applySingle(next); return; }
    }

    const def = trackDefaultRef.current;
    if (def?.type === "group") { applyGroup(def.list, def.groupId); return; }
    if (def?.type === "single") { applySingle(def.qrState); return; }
    applyEmpty();
  }, [applySingle, applyGroup, applyEmpty]);

  // 一覧からタイルをタップ→そのQRだけを拡大表示。一定時間操作が無ければ一覧へ自動で戻す
  const selectGroupQr = useCallback((qr: QRState) => {
    setQrState(qr);
    clearGroupReturnTimer();
    groupReturnTimerRef.current = setTimeout(() => setQrState(null), GROUP_RETURN_MS);
  }, [clearGroupReturnTimer]);

  // 一覧へ手動で戻る
  const returnToGroupList = useCallback(() => {
    clearGroupReturnTimer();
    setQrState(null);
  }, [clearGroupReturnTimer]);

  // NFCタグのリダイレクト先（この機材が載っているホルダーのcurrent_qr_config_id）を
  // 実際の表示に同期。グループモードで一覧表示中(qrState=null)はnullを送り
  // ホームへのフォールバックに任せる。
  //
  // キオスク端末は数時間〜終日開きっぱなしで運用するため、セッション切れ等で
  // このリクエストが認証エラーになると、画面自体は正常に動いて見えるのに
  // NFCタグの飛び先だけがDB上ずっと更新されなくなる（表示は合っているのに
  // 来場者だけ古い/空のQRに飛ばされる）。手動リロードでしか復旧できないと
  // 気づくのが遅れるため、401/403を検知したら自動でページをリロードし
  // 認証をやり直させることで自己修復させる。
  const syncBoothDevice = useCallback(() => {
    if (!masterDeviceId) return;
    const qrConfigId = qrStateRef.current?.qr_config_id ?? null;
    fetch("/api/booth-devices/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: masterDeviceId, event_id: eventId, qr_config_id: qrConfigId }),
    })
      .then((res) => {
        if (res.status === 401 || res.status === 403) window.location.reload();
      })
      .catch(() => {});
  }, [eventId, masterDeviceId]);

  // 割り当てられたトラックのタイムテーブルを取得
  const fetchSchedules = useCallback((trackId: string | null) => {
    const url = trackId
      ? `/api/events/${eventId}/display-schedules?track_id=${trackId}`
      : `/api/events/${eventId}/display-schedules`;
    return fetch(url)
      .then(r => r.ok ? r.json() : [])
      .then((data: DisplaySchedule[]) => {
        schedulesRef.current = data;
        setSchedules(data);
        applySchedule(data);
      })
      .catch(() => {});
  }, [eventId, applySchedule]);

  // 子機を自己登録し、割り当てトラック・トラックのデフォルト表示(単一QR or グループ)を取得
  const registerDevice = useCallback(() => {
    type DefaultTargetPayload =
      | { type: "single"; qr_config: QrConfigInfo }
      | { type: "group"; qr_group: { qr_group_id: string; name: string; members: QrConfigInfo[] } }
      | null;

    if (!masterDeviceId) return Promise.resolve(trackIdRef.current);
    return fetch(`/api/events/${eventId}/display-devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: masterDeviceId, device_name: deviceName }),
    })
      .then(r => r.ok ? r.json() : { track_id: null, default_target: null })
      .then((data: { track_id: string | null; default_target: DefaultTargetPayload }) => {
        trackIdRef.current = data.track_id;

        if (data.default_target?.type === "single") {
          const qs = qrConfigToState(data.default_target.qr_config, siteUrlRef.current);
          trackDefaultRef.current = qs ? { type: "single", qrState: qs } : null;
        } else if (data.default_target?.type === "group") {
          const list = data.default_target.qr_group.members
            .map((qc) => qrConfigToState(qc, siteUrlRef.current))
            .filter((q): q is QRState => q !== null);
          trackDefaultRef.current = { type: "group", list, groupId: data.default_target.qr_group.qr_group_id };
        } else {
          trackDefaultRef.current = null;
        }

        return data.track_id;
      })
      .catch(() => trackIdRef.current);
  }, [eventId, deviceName, masterDeviceId]);

  // 機材名を変更する。機材マスタの表示名を更新するだけで、IDは不変
  // （かつては名前からIDを再生成していたため、変更のたびに別端末として二重登録されていた）
  const updateDeviceName = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === deviceName || !masterDeviceId) return;
    setNameError(null);
    try {
      const res = await fetch(`/api/equipment-devices/${masterDeviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNameError(data.error ?? "名前を変更できませんでした");
        return;
      }
      try { localStorage.setItem(DEVICE_NAME_KEY, data.display_name); } catch {}
      setDeviceName(data.display_name);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
      // イベント側のキャッシュ名も更新（親機一覧の即時反映用）
      fetch(`/api/events/${eventId}/display-devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: masterDeviceId, device_name: data.display_name }),
      }).catch(() => {});
    } catch {
      setNameError("名前を変更できませんでした");
    }
  }, [eventId, deviceName, masterDeviceId]);

  // 子機は終日QRを表示し続ける用途のため、OSの画面タイムアウト設定に依存せず
  // Wake Lock APIで画面消灯を防ぐ。タブが非表示→復帰した際は権限が失われるため再取得する。
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      try { wakeLock = await navigator.wakeLock.request("screen"); } catch {}
    };
    requestWakeLock();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") requestWakeLock();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      wakeLock?.release().catch(() => {});
    };
  }, []);

  // Androidのナビゲーションバー（戻る・ホーム・最近のアプリの三角丸四角）はOS純正のシステムUIで
  // manifestの設定だけでは消せないため、Fullscreen APIで画面タップ時にイミラーシブモードへ移行する。
  // Fullscreen APIはユーザー操作内でしか呼べない仕様のため、タップごとにfullscreen状態を確認し、
  // 外れていれば（電源ボタンでの消灯復帰時・上スワイプでの一時表示時など）再度リクエストする。
  useEffect(() => {
    const enterFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };
    window.addEventListener("touchstart", enterFullscreen);
    window.addEventListener("click", enterFullscreen);
    return () => {
      window.removeEventListener("touchstart", enterFullscreen);
      window.removeEventListener("click", enterFullscreen);
      // ロック解除後の遷移先（オーガナイザー画面）までナビゲーションバーが消えたままにならないよう、
      // この画面を離れる際はfullscreenを解除する
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  // Androidの戻るボタン/ジェスチャーで前画面（オーガナイザー機能）に戻れてしまうのを防止。
  // popstate（戻る操作）を検知したら同じURLへ即座に履歴を積み直し、実際の遷移を打ち消す。
  // パスキー認証後のrouter.pushはpushStateであり popstateを発火しないため、正規の遷移は妨げない。
  useEffect(() => {
    const trapBack = () => history.pushState(null, "", window.location.href);
    history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", trapBack);
    return () => window.removeEventListener("popstate", trapBack);
  }, []);

  // 初回: 自己登録 → タイムテーブル取得 + タイマーで定期再取得（30秒間隔）
  // ※ schedulesRef の再評価だけでは新規登録されたスケジュールを検知できないため、
  //    毎回サーバーから最新のタイムテーブルを取得して適用する
  useEffect(() => {
    registerDevice().then((trackId) => fetchSchedules(trackId));

    const timer = setInterval(() => {
      fetchSchedules(trackIdRef.current);
      syncBoothDevice();
    }, 30_000);
    return () => clearInterval(timer);
  }, [registerDevice, fetchSchedules, syncBoothDevice]);

  // 表示中のQRが変わった瞬間（強制プッシュ・タイムテーブル切替・初回マウント含む）に
  // NFCタグのリダイレクト先を同期する
  useEffect(() => {
    qrStateRef.current = qrState;
    syncBoothDevice();
  }, [qrState, syncBoothDevice]);

  // グループ一覧を表示した瞬間、下に隠れているタイルがあるか判定する
  useEffect(() => {
    if (!groupMode || qrState) return;
    // レイアウト確定後に測るため次フレームで判定
    const raf = requestAnimationFrame(checkScrollBottom);
    return () => cancelAnimationFrame(raf);
  }, [groupMode, qrState, groupList, checkScrollBottom]);

  // 画面サイズに応じてQRサイズを動的計算
  useEffect(() => {
    const calc = () => {
      const size = Math.max(160, Math.min(600, Math.floor(Math.min(window.innerWidth * 0.82, window.innerHeight - 200))));
      setQrSize(size);
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  // QRコード描画
  useEffect(() => {
    if (!qrState?.qr_url || !canvasRef.current) return;
    let targetUrl = qrState.qr_url;
    try {
      const url = new URL(qrState.qr_url);
      url.searchParams.set("device", deviceName);
      targetUrl = url.toString();
    } catch {}
    import("qrcode").then(({ default: QRCode }) => {
      QRCode.toCanvas(canvasRef.current!, targetUrl, {
        width: qrSize,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      }).catch(() => {});
    });
  }, [qrState?.qr_url, qrSize, deviceName]);

  // サインアップ用QR描画（タッチ決済完了時のみ）
  useEffect(() => {
    if (!touchpaySignup || !signupCanvasRef.current) return;
    const signupUrl = `${siteUrlRef.current}/entrance/signup/${touchpaySignup.ticketId}`;
    import("qrcode").then(({ default: QRCode }) => {
      QRCode.toCanvas(signupCanvasRef.current!, signupUrl, {
        width: Math.min(qrSize, 320),
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      }).catch(() => {});
    });
  }, [touchpaySignup, qrSize]);

  // 初期チア数取得 + ポーリングフォールバック（Realtimeが届かない場合の保険）
  useEffect(() => {
    const fetchCount = (isInitial: boolean) =>
      fetch(`/api/events/${eventId}/display-stats`)
        .then((r) => r.ok ? r.json() : null)
        .then((d: { count: number } | null) => {
          if (d?.count == null) return;
          const serverCount = d.count;
          if (isInitial) {
            setCheerCount(serverCount);
            lastPolledCountRef.current = serverCount;
            return;
          }
          const diff = serverCount - lastPolledCountRef.current;
          lastPolledCountRef.current = serverCount;
          if (diff <= 0) return;

          // Realtimeが直近10秒以内に届いていれば重複防止でスキップ
          const realtimeLag = Date.now() - lastRealtimeRef.current;
          if (realtimeLag < 10_000) {
            // Realtimeは動いている → カウントだけ補正
            setCheerCount((cur) => Math.max(cur, serverCount));
          } else {
            // Realtimeが止まっている → ポーリングでハートを出す（最大5件）
            for (let i = 0; i < Math.min(diff, 5); i++) {
              setTimeout(() => onCheerNew(false), i * 300);
            }
          }
        })
        .catch(() => {});

    fetchCount(true);
    const interval = setInterval(() => fetchCount(false), 15_000);
    return () => clearInterval(interval);
  }, [eventId, onCheerNew]);

  // Supabase Realtime
  useEffect(() => {
    // 機材IDが確定するまで購読しない（presenceキーが仮IDのまま登録されて
    // 親機に幽霊デバイスとして見えるのを防ぐ）
    if (!masterDeviceId) return;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    const supabase = createClient();
    const deviceId = masterDeviceId;

    const channel = supabase.channel(`event-display:${eventId}`, {
      config: { presence: { key: deviceId } },
    });

    channel.on("broadcast", { event: "qr-switch" }, ({ payload }) => {
      const { target_device_id, is_forced, cancel_forced, group_members, qr_group_id, ...qrData } = payload as QRState & {
        target_device_id?: string | null;
        is_forced?: boolean;
        cancel_forced?: boolean;
        group_members?: QRState[];
        qr_group_id?: string;
      };
      // target_device_id指定時、自分宛てでなければ無視（端末別の強制表示・解除）
      if (target_device_id != null && target_device_id !== deviceId) return;
      if (cancel_forced) {
        // 強制モード解除 → タイムテーブル/トラックのデフォルトに戻す(単一表示 or グループ一覧)
        isForcedRef.current = false;
        setIsForcedOverride(false);
        applySchedule(schedulesRef.current);
        setFlash(true);
        setTimeout(() => setFlash(false), 350);
        return;
      }
      if (is_forced) {
        isForcedRef.current = true;
        setIsForcedOverride(true);
      }
      // グループの強制表示(group_members同梱)か、単一QRの強制表示かを分岐
      if (group_members) {
        clearGroupReturnTimer();
        applyGroup(group_members, qr_group_id ?? "");
      } else if (isValidQrState(qrData)) {
        activeGroupIdRef.current = null;
        setGroupMode(false);
        clearGroupReturnTimer();
        setQrState(qrData);
        try { localStorage.setItem(STORAGE_KEY(eventId), JSON.stringify(qrData)); } catch {}
      } else {
        return;
      }
      setFlash(true);
      setTimeout(() => setFlash(false), 350);
    });

    channel.on("broadcast", { event: "cheer-new" }, () => {
      onCheerNew();
    });

    // タッチ決済（Case④）完了・新規客 → サインアップ用QRを表示する。
    // 親機スタッフが「次の決済へ」を押す（touchpay-clearイベント）まで、
    // タイマーでは絶対に消さない（客がQRを読み取る時間を確実に確保するため）。
    channel.on("broadcast", { event: "touchpay-signup" }, ({ payload }) => {
      const { ticket_id, quantity, target_device_id } = payload as { ticket_id: string; quantity: number; target_device_id?: string | null };
      // target_device_id指定時、自分宛てでなければ無視（子機を1台に絞ったペアリング）
      if (target_device_id != null && target_device_id !== deviceId) return;
      setTouchpaySignup({ ticketId: ticket_id, quantity });
    });

    // 親機スタッフの明示操作でのみサインアップQRをクリアする
    channel.on("broadcast", { event: "touchpay-clear" }, ({ payload }) => {
      const { target_device_id } = (payload ?? {}) as { target_device_id?: string | null };
      if (target_device_id != null && target_device_id !== deviceId) return;
      setTouchpaySignup(null);
    });

    // コントロールパネルからトラック割当が変更された → 再登録してタイムテーブルを更新
    channel.on("broadcast", { event: "track-assigned" }, ({ payload }) => {
      const { device_id: targetDeviceId } = payload as { device_id: string; track_id: string | null };
      if (targetDeviceId !== deviceId) return;
      registerDevice().then((trackId) => fetchSchedules(trackId));
    });

    // コントロールパネルでタイムテーブルが追加・削除された → 即座に最新スケジュールを取得して反映
    channel.on("broadcast", { event: "schedule-updated" }, () => {
      fetchSchedules(trackIdRef.current);
    });

    // コントロールパネルでトラックのデフォルト表示、またはQRグループの中身(名前・メンバー)が
    // 変更された → 手動リロード不要で即座に再取得・再適用する。
    // どのトラック/グループが影響を受けたかを子機側で判定するより、常に再取得する方が
    // シンプルかつ確実(頻度が低い管理操作のため負荷は問題にならない)
    channel.on("broadcast", { event: "qr-group-updated" }, () => {
      registerDevice().then((trackId) => fetchSchedules(trackId));
    });

    let cancelled = false;

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        setChannelError(null);
        const battery = await getBatteryLevel();
        channel.track({ role: "display", device_id: deviceId, device_name: deviceName, battery_level: battery, joined_at: new Date().toISOString() });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setConnected(false);
        setChannelError(`接続エラー: ${status}`);
        // ネットワーク瞬断・端末スリープ復帰等での切断は自動では復帰しないため、
        // 数秒後に自動で再購読を試みる（cancelled=trueならこのeffectの片付け中の
        // 意図的なCLOSEDなので再接続しない）。
        if (!cancelled) {
          reconnectTimerRef.current = setTimeout(() => {
            if (!cancelled) setReconnectNonce((n) => n + 1);
          }, 5000);
        }
      }
    });

    const timer = setInterval(async () => {
      const battery = await getBatteryLevel();
      channel.track({ role: "display", device_id: deviceId, device_name: deviceName, battery_level: battery });
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (surgeTimerRef.current) clearTimeout(surgeTimerRef.current);
      if (counterPulseTimerRef.current) clearTimeout(counterPulseTimerRef.current);
      if (groupReturnTimerRef.current) clearTimeout(groupReturnTimerRef.current);
      if (celebrationTimerRef.current) {
        clearInterval(celebrationTimerRef.current);
        celebrationTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [eventId, deviceName, masterDeviceId, onCheerNew, registerDevice, fetchSchedules, applySchedule, applyGroup, clearGroupReturnTimer, reconnectNonce]);

  // 手動再接続ボタン用。保留中の自動リトライがあれば先に打ち消してから即座に再購読する。
  const handleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setReconnectNonce((n) => n + 1);
  }, []);

  // 長押し検出（3秒でロック解除モーダル表示）
  const HOLD_DURATION = 3000;

  // タッチデバイスではtouchstart/touchendの後にブラウザが疑似マウスイベント
  // (mousedown/mouseup)を遅延発火することがあり、対応するendが来ないまま
  // handleHoldStartが二重に呼ばれると setInterval の参照が上書きされ、
  // 古い方が二度とclearされず永遠に進捗を書き換え続けるバグがあった。
  // 多重起動そのものを防ぐガードで根本的に塞ぐ。
  const holdActiveRef = useRef(false);

  const handleHoldStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (showUnlock || holdActiveRef.current) return;
    holdActiveRef.current = true;
    holdStartRef.current = Date.now();
    holdIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      setHoldProgress(Math.min(100, (elapsed / HOLD_DURATION) * 100));
    }, 30);
    holdTimerRef.current = setTimeout(() => {
      if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
      holdActiveRef.current = false;
      setHoldProgress(0);
      setShowUnlock(true);
    }, HOLD_DURATION);
  };

  const handleHoldEnd = () => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
    holdActiveRef.current = false;
    setHoldProgress(0);
  };

  const closeUnlock = () => setShowUnlock(false);

  const handleUnlockSuccess = () => {
    // 再遷移時にロック解除モーダル（パスキー認証成功表示）が残ったまま
    // 復元されてしまうため、遷移前に閉じておく
    setShowUnlock(false);
    router.push(`/dashboard/events/${eventId}`);
  };

  return (
    <>
      {/* ハートアニメーション用キーフレーム */}
      <style>{`
        @keyframes heartFloat {
          0%   { transform: translateY(0) scale(1); opacity: 1; }
          70%  { opacity: 0.8; }
          100% { transform: translateY(-78vh) scale(0.15); opacity: 0; }
        }
        @keyframes surgeBreath {
          0%, 100% { opacity: 0.15; }
          50%       { opacity: 0.35; }
        }
        @keyframes textPop {
          0%   { transform: scale(0.4) translateY(10px) rotate(-6deg); opacity: 0; }
          30%  { transform: scale(1.15) translateY(0) rotate(3deg); opacity: 1; }
          70%  { transform: scale(1) rotate(-2deg); opacity: 1; }
          100% { transform: scale(0.9) translateY(-40px) rotate(0deg); opacity: 0; }
        }
        @keyframes counterPop {
          0%   { transform: scale(1); }
          35%  { transform: scale(1.7); }
          65%  { transform: scale(0.9); }
          100% { transform: scale(1); }
        }
        @keyframes sparkleFlash {
          0%   { transform: scale(0.2) rotate(-20deg); opacity: 0; }
          40%  { transform: scale(1.4) rotate(15deg); opacity: 1; }
          100% { transform: scale(0.4) rotate(35deg); opacity: 0; }
        }
      `}</style>

      <div
        className="fixed inset-0 flex flex-col items-center justify-center select-none bg-slate-950"
        style={{ overscrollBehavior: "none" }}
        onTouchStart={handleHoldStart}
        onTouchEnd={handleHoldEnd}
        onMouseDown={handleHoldStart}
        onMouseUp={handleHoldEnd}
        onMouseLeave={handleHoldEnd}
      >
        {/* フラッシュ演出 */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-150"
          style={{ backgroundColor: "#ffffff", opacity: flash ? 0.6 : 0 }}
        />

        {/* サージグロー */}
        {surgeGlow && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at center, rgba(255,64,129,0.3) 0%, transparent 70%)",
              animation: "surgeBreath 0.8s ease-in-out infinite",
            }}
          />
        )}

        {/* 浮遊ハート */}
        {hearts.map((h) => (
          <div
            key={h.id}
            className="absolute pointer-events-none"
            style={{
              left: `${h.x}%`,
              bottom: "8%",
              fontSize: `${h.size}rem`,
              color: h.color,
              lineHeight: 1,
              animation: `heartFloat ${h.duration}ms ease-out ${h.delay}ms both`,
              textShadow: surgeGlow ? `0 0 12px ${h.color}` : "none",
            }}
          >
            ♥
          </div>
        ))}

        {/* 浮遊テキスト（Thank you! / Cheers!） */}
        {texts.map((t) => (
          <div
            key={t.id}
            className="absolute pointer-events-none font-black italic uppercase tracking-tight"
            style={{
              left: `${t.x}%`,
              top: `${t.y}%`,
              fontSize: `${t.size}rem`,
              color: t.color,
              lineHeight: 1,
              textShadow: `0 0 16px ${t.color}, 0 2px 8px rgba(0,0,0,0.6)`,
              animation: `textPop ${t.duration}ms ease-out ${t.delay}ms both`,
            }}
          >
            {t.text}
          </div>
        ))}

        {/* 長押しプログレス */}
        {holdProgress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-800/30">
            <div
              className="h-full bg-indigo-500 transition-none"
              style={{ width: `${holdProgress}%` }}
            />
          </div>
        )}

        {/* 接続インジケーター */}
        <div className="absolute top-4 right-4 z-10 pointer-events-none flex items-center gap-2">
          {isForcedOverride && (
            <span className="text-[9px] font-black text-amber-400/70 uppercase tracking-widest">MANUAL</span>
          )}
          {schedules.length > 0 && !isForcedOverride && (
            <span className="text-[9px] font-black text-indigo-400/60 uppercase tracking-widest">AUTO</span>
          )}
          {connected ? (
            <Wifi size={14} className="text-green-400/50" />
          ) : (
            <button
              type="button"
              onClick={handleReconnect}
              className="pointer-events-auto flex items-center gap-1 text-red-400 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-1"
            >
              <WifiOff size={12} />
              <span className="text-[9px] font-black uppercase tracking-widest">再接続</span>
            </button>
          )}
        </div>

        {/* チア数カウンター */}
        {cheerCount > 0 && (
          <div className="absolute top-4 left-4 z-10 pointer-events-none flex items-center gap-3">
            <span
              style={{
                color: "#ff6b9d", fontSize: "4.6rem", lineHeight: 1, display: "inline-block",
                textShadow: "0 0 10px #ff6b9d",
                animation: counterPulse ? "counterPop 0.6s ease-out" : undefined,
              }}
            >♥</span>
            <span className="relative font-black tabular-nums"
              style={{
                color: "#ff6b9d", fontSize: "3rem", display: "inline-block",
                textShadow: surgeGlow ? "0 0 8px #ff6b9d" : "none",
                animation: counterPulse ? "counterPop 0.6s ease-out" : undefined,
              }}>
              {cheerCount.toLocaleString()}
              {counterPulse && (
                <Sparkles
                  size={40}
                  className="absolute -top-4 -right-9 text-yellow-300"
                  style={{ animation: "sparkleFlash 0.7s ease-out", filter: "drop-shadow(0 0 6px #ffd54f)" }}
                />
              )}
            </span>
          </div>
        )}

        {/* 端末名表示（常時・画面端） */}
        <div className="absolute bottom-3 right-3 z-10 pointer-events-none">
          <span className="text-[9px] font-mono text-slate-700 tracking-wider">{deviceName}</span>
        </div>

        {/* グループ一覧に戻る（常に画面下部に固定。QR表示ブロックの高さに応じて
            位置が動くと、画面が小さい/縦幅が狭い端末(dtab d-41A等)で画面外に
            はみ出して押せなくなるため、中身の描画フローとは独立させて
            画面端に直接ピン留めする） */}
        {qrState && groupMode && (
          <button
            type="button"
            onClick={returnToGroupList}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-auto flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 text-slate-300 text-xs font-bold rounded-full px-4 py-2"
          >
            ← 一覧に戻る
          </button>
        )}

        {/* QR表示 */}
        {qrState ? (
          <div className="relative flex flex-col items-center gap-4 px-4 py-6 w-full pointer-events-none">
            <p className="text-4xl font-black text-white uppercase tracking-tight text-center leading-tight">
              {qrState.label || qrState.product_name}
            </p>
            <p className="text-base font-bold text-slate-400 text-center">
              {qrState.artist_name ? <><span className="text-pink-400">宛先：</span>{qrState.artist_name}</> : eventTitle}
            </p>
            <div className="p-5 pb-3 bg-white rounded-3xl shadow-2xl flex flex-col items-center gap-1.5">
              <canvas ref={canvasRef} />
              <div className="flex items-center gap-1.5 pt-1">
                <img src="/logo-emblem.png" alt="" className="h-4 w-auto" />
                <span className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em]">Direct Cheers</span>
              </div>
            </div>
            <p className="text-xs text-slate-600 font-mono uppercase tracking-widest">
              {qrState.qr_config_id?.slice(0, 8) ?? ""}
            </p>
          </div>
        ) : groupMode && groupList.length > 1 ? (
          <div className="relative flex flex-col items-center gap-4 px-6 py-8 w-full h-full max-h-full">
            <p className="text-2xl font-black text-white text-center">読み取りたいQRコードを選んでください</p>
            <div
              ref={groupListScrollRef}
              onScroll={checkScrollBottom}
              className="w-full max-w-3xl overflow-y-auto pointer-events-auto"
              style={{ maxHeight: "calc(100vh - 260px)" }}
            >
              <div className="grid grid-cols-3 gap-4 pb-6">
                {groupList.map((qr) => (
                  <button
                    key={qr.qr_config_id}
                    type="button"
                    onClick={() => selectGroupQr(qr)}
                    className="flex flex-col items-center gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-3 hover:border-pink-500/50 transition-colors"
                  >
                    <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-800 flex items-center justify-center">
                      {qr.artist_avatar_url && !isLowMemoryDevice
                        ? <img src={qr.artist_avatar_url} alt="" loading="lazy" decoding="async" width={200} height={200} className="w-full h-full object-cover" />
                        : <Smartphone size={28} className="text-slate-600" />}
                    </div>
                    <p className="text-xs font-black text-white text-center leading-tight line-clamp-2">
                      {qr.label || qr.product_name}
                    </p>
                  </button>
                ))}
              </div>
            </div>
            {hasMoreBelow && (
              <div className="absolute inset-x-0 bottom-0 h-16 pointer-events-none flex items-end justify-center pb-1"
                style={{ background: "linear-gradient(to bottom, transparent, rgba(2,6,23,0.92))" }}>
                <ChevronDown size={22} className="text-slate-300 animate-bounce" />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center px-8 pointer-events-none">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
              {channelError
                ? <WifiOff size={24} className="text-red-400" />
                : <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-400 rounded-full animate-spin" />}
            </div>
            {channelError
              ? <p className="text-red-400 font-bold text-sm">{channelError}</p>
              : <p className="text-slate-400 font-bold text-sm">親機からの指示を待機中</p>}
            <p className="text-slate-600 text-xs">{eventTitle}</p>
            {channelError && (
              <button
                type="button"
                onClick={handleReconnect}
                className="pointer-events-auto flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold rounded-full px-4 py-2"
              >
                <WifiOff size={12} /> 再接続
              </button>
            )}
          </div>
        )}

        {/* タッチ決済完了 → サインアップ用QRオーバーレイ */}
        {touchpaySignup && (
          <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center z-40 px-6 gap-4">
            <p className="text-2xl font-black text-white text-center">
              {touchpaySignup.quantity}名分のご購入ありがとうございます！
            </p>
            <p className="text-sm text-slate-400 text-center">
              スマホでQRを読み取ってサインアップ（任意）
            </p>
            <div className="p-5 pb-3 bg-white rounded-3xl shadow-2xl flex flex-col items-center gap-1.5">
              <canvas ref={signupCanvasRef} />
            </div>
            <p className="text-xs text-slate-600">サインアップしなくても入場は完了しています</p>
          </div>
        )}

        {/* ロック解除モーダル */}
        {showUnlock && (
          <div className="absolute inset-0 bg-black/80 flex items-end justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-xs space-y-4">
              <div className="flex items-center gap-2">
                <Lock size={14} className="text-indigo-400" />
                <p className="text-sm font-black text-white">ロック解除</p>
              </div>

              {/* 端末名（識別名）設定 */}
              <div className="space-y-2 pb-4 border-b border-slate-700">
                <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                  <Smartphone size={12} /> 端末名（識別名）
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="例: DJ-01"
                    className="flex-1 h-10 px-3 bg-slate-800 border border-slate-600 rounded-xl text-white text-sm font-bold focus:outline-none focus:border-indigo-400"
                  />
                  <button
                    type="button"
                    onClick={() => updateDeviceName(nameInput)}
                    disabled={!nameInput.trim() || nameInput.trim() === deviceName}
                    className="h-10 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-black text-sm transition-all"
                  >
                    保存
                  </button>
                </div>
                {nameSaved && <p className="text-xs text-emerald-400 font-bold">保存しました</p>}
                {nameError && <p className="text-xs text-red-400 font-bold">{nameError}</p>}
              </div>

              <PasskeySetup
                mode="stepup"
                email={userEmail}
                buttonLabel="パスキーで解除"
                onSuccess={handleUnlockSuccess}
              />

              <button
                type="button"
                onClick={closeUnlock}
                className="w-full h-12 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2"
              >
                <X size={14} /> キャンセル（QR表示に戻る）
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
