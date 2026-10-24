"use client";

// チアリー(AI) の確認カード（イベントの下書き・会場の登録・ピンを置く地図・QR の作成）。
// 材料はサーバーがツールの結果から作ったもの（lib/cheery/cards.ts）。ボタンを押したときだけ /api/cheery/action に送る。
// まだ誰にも届いていないこと・登録した会場は全主催者が選べることを必ず書く（requirements.md 9章、p5-design.md）。
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarPlus, Check, ExternalLink, Loader2, LocateFixed, MapPin, PencilLine, QrCode } from "lucide-react";
import { QRImageUpload } from "@/components/qr-image-upload";
import { LABEL_GUIDE, labelSuggestions, labelWarning } from "@/lib/qr/label";
import { IMAGE_RIGHTS_GUIDE, QR_AFTER_NOTES, RECIPIENT_GUIDE } from "@/lib/qr/guide";
import { jstDateTime } from "@/lib/mcp/format";
import { slotDecided, type CardDone, type CheeryCard, type EventDraftCard, type QrCreateCard, type QrEditCard, type QrPersonOption, type VenuePinCard, type VenueRegisterCard } from "@/lib/cheery/cards";

type Handlers = {
  onDone: (cardId: string, done: CardDone, note: string) => void;
  onAddCard: (card: CheeryCard) => void;
  onNavigate: () => void;
};

async function act(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  try {
    const res = await fetch("/api/cheery/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return await res.json();
  } catch {
    return { ok: false, error: "うまくつながりませんでした。通信の状態を確かめて、もう一度お試しください" };
  }
}

const box = "max-w-[95%] bg-slate-950/60 border border-slate-700 rounded-2xl px-3 py-3 space-y-2.5";
const primary = "flex items-center gap-1 text-[11px] font-bold text-white bg-pink-500/80 hover:bg-pink-500 rounded-xl px-3 py-1.5 disabled:opacity-40";
const secondary = "flex items-center gap-1 text-[11px] font-bold text-slate-300 border border-slate-700 rounded-xl px-3 py-1.5 hover:border-pink-500/50";
const notice = "text-[10px] leading-snug text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1.5";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="w-14 shrink-0 text-slate-500">{k}</span>
      <span className="flex-1 min-w-0 text-slate-200 break-words">{v}</span>
    </div>
  );
}

export function CheeryCards({ cards, done, ...h }: { cards: CheeryCard[]; done?: Record<string, CardDone> } & Handlers) {
  return (
    <>
      {cards.map((c) =>
        c.kind === "event_draft" ? <EventDraftView key={c.card_id} card={c} done={done?.[c.card_id]} {...h} />
        : c.kind === "venue_register" ? <VenueRegisterView key={c.card_id} card={c} done={done?.[c.card_id]} {...h} />
        : c.kind === "qr_create" ? <QrCreateView key={c.card_id} card={c} done={done?.[c.card_id]} {...h} />
        : c.kind === "qr_edit" ? <QrEditView key={c.card_id} card={c} done={done?.[c.card_id]} {...h} />
        : <VenuePinView key={c.card_id} card={c} done={done?.[c.card_id]} {...h} />,
      )}
    </>
  );
}

// ── 会場の確認カード ──────────────────────────────

function VenueRegisterView({ card, done, onDone }: { card: VenueRegisterCard; done?: CardDone } & Handlers) {
  const [line1, setLine1] = useState(card.line1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const mapHref = card.maps_uri ?? (card.latitude != null && card.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${card.latitude},${card.longitude}` : null);

  const register = async () => {
    setBusy(true);
    setError(null);
    const r = await act({
      action: "register_venue", card_id: card.card_id, name: card.name, postal_code: card.postal_code, prefecture: card.prefecture,
      city: card.city, town: card.town, line1: line1.trim(), latitude: card.latitude, longitude: card.longitude,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "登録できませんでした"); return; }
    onDone(card.card_id, { kind: "venue_registered", venue_name: String(r.name) }, `（会場「${String(r.name)}」を登録しました。イベントの会場に使えます）`);
  };

  return (
    <div className={box} data-cheery-card="venue_register">
      <p className="text-[11px] font-black text-white flex items-center gap-1"><MapPin size={12} className="text-pink-400" /> 会場の確認</p>
      <Row k="会場名" v={card.name} />
      <Row k="郵便番号" v={`〒${card.postal_code}`} />
      <Row k="住所" v={`${card.prefecture}${card.city}${card.town ?? ""}${card.line1}`} />
      {card.source === "pin" && <p className="text-[10px] text-slate-400">ピンに一番近い住所です</p>}
      {!card.line1 && !done && (
        <label className="block space-y-1">
          <span className="text-[10px] text-slate-400">番地が分からない場所です。現地の目印を入れてください（例：白いゲート前）</span>
          <input value={line1} onChange={(e) => setLine1(e.target.value)} maxLength={200}
            className="w-full h-9 bg-slate-800 border border-slate-700 rounded-lg px-2 text-base md:text-xs text-white outline-none focus:border-pink-500/50" />
        </label>
      )}
      {mapHref && (
        <a href={mapHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-300">
          <ExternalLink size={11} /> 地図で場所を確かめる
        </a>
      )}
      {done ? (
        <p className="flex items-center gap-1 text-[11px] font-bold text-emerald-300"><Check size={12} /> 登録しました</p>
      ) : dismissed ? (
        <p className="text-[11px] text-slate-400">この候補は使いません。正しい会場名や地域をチャットで伝えてください</p>
      ) : (
        <>
          <p className={notice}>この会場は、全主催者が選べる会場一覧に登録されます。登録した後は直せないので、地図で場所を確かめてください</p>
          {error && <p className="text-[11px] text-amber-300">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={register} disabled={busy || !line1.trim()} className={primary}>
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} この会場を登録する
            </button>
            <button type="button" onClick={() => setDismissed(true)} disabled={busy} className={secondary}>違う</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── ピンを置く地図 ──────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any -- Google Maps の JS は型定義を入れていない */
declare global { interface Window { google?: any; __dcMapsLoading?: Promise<void> } }

function loadMaps(): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (window.__dcMapsLoading) return window.__dcMapsLoading;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  window.__dcMapsLoading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key ?? "")}&language=ja&region=JP`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { window.__dcMapsLoading = undefined; reject(new Error("maps")); };
    document.head.appendChild(s);
  });
  return window.__dcMapsLoading;
}

const JAPAN = { lat: 36.2, lng: 138.25 };

function VenuePinView({ card, done, onAddCard }: { card: VenuePinCard; done?: CardDone } & Handlers) {
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [placed, setPlaced] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const putPin = (lat: number, lng: number) => {
    setPin({ lat, lng });
    const g = window.google;
    if (!g || !mapRef.current) return;
    if (!markerRef.current) markerRef.current = new g.maps.Marker({ map: mapRef.current });
    markerRef.current.setPosition({ lat, lng });
  };

  const open = async () => {
    setBusy(true);
    setError(null);
    // 地図を出すたびに1回と数える（地図の表示の無料の上限。上限なら出さずに手入力へ）
    const r = await act({ action: "map_load" });
    if (!r.ok) { setBusy(false); setError(r.error ?? "地図を開けませんでした"); return; }
    try {
      await loadMaps();
      setOpened(true);
    } catch {
      setError("地図を読み込めませんでした。住所をチャットで伝えてください");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!opened || !mapEl.current || mapRef.current) return;
    const g = window.google;
    const center = card.center ? { lat: card.center.latitude, lng: card.center.longitude } : JAPAN;
    mapRef.current = new g.maps.Map(mapEl.current, {
      center, zoom: card.center ? 13 : 5, gestureHandling: "greedy", streetViewControl: false, mapTypeControl: true, fullscreenControl: false,
    });
    mapRef.current.addListener("click", (e: any) => putPin(e.latLng.lat(), e.latLng.lng()));
  }, [opened, card.center]);

  const here = () => {
    if (!navigator.geolocation) { setError("この端末では現在地が使えません"); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { putPin(p.coords.latitude, p.coords.longitude); mapRef.current?.setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }); mapRef.current?.setZoom(16); },
      () => setError("現在地を取れませんでした。地図をタップしてピンを置いてください"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const confirm = async () => {
    if (!pin) return;
    setBusy(true);
    setError(null);
    const r = await act({ action: "pin_to_address", name: card.name, latitude: pin.lat, longitude: pin.lng });
    setBusy(false);
    if (!r.ok || !r.card) { setError(r.error ?? "住所を引けませんでした"); return; }
    setPlaced(true);
    onAddCard(r.card as CheeryCard);
  };

  return (
    <div className={box} data-cheery-card="venue_pin">
      <p className="text-[11px] font-black text-white flex items-center gap-1"><MapPin size={12} className="text-pink-400" /> 「{card.name}」の場所</p>
      {done || placed ? (
        <p className="text-[11px] text-slate-400">ピンを置きました。下の会場の確認カードを見てください</p>
      ) : !opened ? (
        <button type="button" onClick={open} disabled={busy} className={primary}>
          {busy ? <Loader2 size={11} className="animate-spin" /> : <MapPin size={11} />} 地図を開いてピンを置く
        </button>
      ) : (
        <>
          <div ref={mapEl} className="w-full h-56 rounded-xl overflow-hidden border border-slate-700 bg-slate-800" />
          <p className="text-[10px] text-slate-400">地図をタップしてピンを置きます。現地にいるなら「現在地」も使えます</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={here} disabled={busy} className={secondary}><LocateFixed size={11} /> 現在地</button>
            <button type="button" onClick={confirm} disabled={busy || !pin} className={primary}>
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} この位置にする
            </button>
          </div>
        </>
      )}
      {error && <p className="text-[11px] text-amber-300">{error}</p>}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── イベントの下書きの確認カード ──────────────────────────────

function EventDraftView({ card, done, onDone, onNavigate }: { card: EventDraftCard; done?: CardDone } & Handlers) {
  // 出演者：言われた名前と完全に同じ人が1人だけなら決まり（外すこともできる）。それ以外は本人が選ぶか
  // 「入れない」を選ぶまで作れない（勝手に決めない）。"?" は未選択、"" は「入れない」
  const [picked, setPicked] = useState<string[]>(() => card.performers.map((s) => (slotDecided(s) ? s.options[0].profile_id : "?")));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // 出演者が空のカードは、本人が「出演者なしで作る」を選ぶまで作れない（AI が聞き返さなかったときも、本人が決める）
  const [noPerformers, setNoPerformers] = useState(false);
  const unresolved = picked.some((p) => p === "?") || (card.performers.length === 0 && !noPerformers);

  const create = async () => {
    setBusy(true);
    setError(null);
    const r = await act({
      action: "create_event_draft", card_id: card.card_id, title: card.title, venue_id: card.venue.venue_id,
      start_at: card.start_at, end_at: card.end_at, organizer_profile_id: card.organizer.profile_id,
      performer_ids: picked.filter((p) => p && p !== "?"),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "作れませんでした"); return; }
    onDone(card.card_id, { kind: "event_created", event_id: String(r.eventId), title: String(r.title) }, `（下書き「${String(r.title)}」を作りました。承認依頼を送るまで誰にも届きません）`);
  };

  return (
    <div className={box} data-cheery-card="event_draft">
      <p className="text-[11px] font-black text-white flex items-center gap-1"><CalendarPlus size={12} className="text-pink-400" /> 下書きの確認</p>
      <Row k="タイトル" v={card.title} />
      <Row k="会場" v={`${card.venue.name}（${card.venue.place}）`} />
      <Row k="開始" v={jstDateTime(card.start_at)} />
      <Row k="終了" v={jstDateTime(card.end_at)} />
      <Row k="名義" v={card.organizer.profile_id ? `${card.organizer.name}（代理）` : "自分"} />
      <div className="flex gap-2 text-[11px]">
        <span className="w-14 shrink-0 text-slate-500">出演者</span>
        <div className="flex-1 min-w-0 space-y-1.5">
          {card.performers.length === 0 && (done ? <span className="text-slate-200">なし</span> : (
            <label className="flex items-center gap-1.5 text-slate-200">
              <input type="checkbox" checked={noPerformers} onChange={(e) => setNoPerformers(e.target.checked)} />
              出演者なしで作る（いる場合はチャットで名前を伝えてください）
            </label>
          ))}
          {card.performers.map((slot, i) => (
            <div key={i} className="space-y-1">
              {slotDecided(slot) ? (
                <label className="flex items-center gap-1.5 text-slate-200">
                  <input type="checkbox" disabled={!!done} checked={picked[i] !== ""} onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? (e.target.checked ? slot.options[0].profile_id : "") : v)))} />
                  {slot.options[0].name}{slot.options[0].sub ? <span className="text-slate-500">（{slot.options[0].sub}）</span> : null}
                </label>
              ) : (
                <>
                  <p className="text-slate-400">
                    {slot.exact ? `「${slot.query}」という名前の人が${slot.options.length}人います。選んでください` : `「${slot.query}」と同じ名前の人はいません。この中にいれば選んでください`}
                  </p>
                  {slot.options.map((o) => (
                    <label key={o.profile_id} className="flex items-center gap-1.5 text-slate-200">
                      <input type="radio" name={`${card.card_id}-${i}`} disabled={!!done} checked={picked[i] === o.profile_id} onChange={() => setPicked((p) => p.map((v, j) => (j === i ? o.profile_id : v)))} />
                      {o.name}{o.sub ? <span className="text-slate-500">（{o.sub}）</span> : null}{o.connected ? <span className="text-emerald-400/80">・コネクション済み</span> : null}
                    </label>
                  ))}
                  <label className="flex items-center gap-1.5 text-slate-400">
                    <input type="radio" name={`${card.card_id}-${i}`} disabled={!!done} checked={picked[i] === ""} onChange={() => setPicked((p) => p.map((v, j) => (j === i ? "" : v)))} />
                    入れない
                  </label>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      {done?.kind === "event_created" ? (
        <>
          <p className="flex items-center gap-1 text-[11px] font-bold text-emerald-300"><Check size={12} /> 下書きを作りました</p>
          <Link href={`/dashboard/events/${done.event_id}`} onClick={onNavigate} className={primary + " w-fit"}>
            <ExternalLink size={11} /> イベントを開く
          </Link>
        </>
      ) : (
        <>
          <p className={notice}>
            まだ誰にも届いていません。出演依頼は承認依頼のときに送られます。出演者は、下書きを作ったあともイベントの編集画面で追加・変更できます。
            {card.organizer.profile_id ? "代理の下書きは、主催者に確認を依頼するまで主催者からは見えません。" : ""}
          </p>
          {editing && (
            <p className="text-[10px] text-slate-400">
              直したいところをチャットで伝えてください。カードを作り直します。作成画面で直接入れることもできます：
              <Link href="/dashboard/events/create" onClick={onNavigate} className="ml-1 text-indigo-300 font-bold">作成画面を開く</Link>
            </p>
          )}
          {error && <p className="text-[11px] text-amber-300">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={create} disabled={busy || unresolved} className={primary}>
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} 下書きを作る
            </button>
            <button type="button" onClick={() => setEditing(true)} disabled={busy} className={secondary}><PencilLine size={11} /> 項目を直す</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── QR の確認カード ──────────────────────────────

const QR_TYPE_LABEL = { standard: "スタンダード", message: "メッセージ", entrance: "エントランス" } as const;
const QR_PAYMENT_LABEL = { A: "前売事後確定（5日前確定）", B: "前売即時確定", C: "当日決済" } as const;
const yen = (n: number) => `¥${n.toLocaleString()}`;

function QrCreateView({ card, done, onDone, onNavigate }: { card: QrCreateCard; done?: CardDone } & Handlers) {
  // 言われた人ごとに選んだ候補（"profile_id::role"）。完全に同じ名前の1人だけなら決まり、それ以外は本人が選ぶまで作れない
  const key = (o: { profile_id: string; role: string }) => `${o.profile_id}::${o.role}`;
  const [picked, setPicked] = useState<string[]>(() => card.people.map((p) => (slotDecided(p) ? key(p.options[0]) : "?")));
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  // 画像は著作権・肖像権に問題のないものだけ（利用規約 第7条）。本人が印を付けるまで作れない（画像を替えたら印は外れる）
  const [imageOk, setImageOk] = useState(false);
  // 宛先：本人が会話で名前を言っていなければ、AI の選んだ人は使わず、ここで配分先の中から本人が選ぶ
  const [recipientChoice, setRecipientChoice] = useState("");
  // ラベルはお客様の画面に出る唯一の名前。本人がここで確かめて印を付けるまで作れない（直したら印は外れる）
  const [label, setLabel] = useState(card.label ?? "");
  const [labelOk, setLabelOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const option = (i: number) => card.people[i].options.find((o) => key(o) === picked[i]) ?? null;
  const targetOptions = card.targets.map((t) => option(t.person)).filter((o): o is QrPersonOption => o != null);
  const recipient = card.recipient_said ? option(card.recipient) : targetOptions.find((o) => key(o) === recipientChoice) ?? null;
  const unresolved = picked.some((p) => p === "?") || !recipient || (card.needs_image && (!imageUrl || !imageOk)) || !labelOk || !label.trim();
  // 候補：本人が会話で言ったラベル＋「誰に・何を払うものか」が分かる形（宛先を選ぶと変わる）
  const suggestions = [...new Set([...(card.label ? [card.label] : []), ...labelSuggestions(card.product_type, card.payment_type, recipient?.name ?? null)])];
  const createHref = `/dashboard/events/${card.event.event_id}/qr/create`;

  const create = async () => {
    if (!recipient) return;
    setBusy(true);
    setError(null);
    const r = await act({
      action: "create_qr", card_id: card.card_id, event_id: card.event.event_id, product_type: card.product_type, payment_type: card.payment_type,
      label: label.trim(), min_amount: card.min_amount, max_amount: card.max_amount, stock_limit: card.stock_limit,
      sales_start_at: card.sales_start_at, sales_end_at: card.sales_end_at,
      recipient_profile_id: recipient.profile_id, recipient_name_context: recipient.role,
      targets: card.targets.map((t) => ({ profile_id: option(t.person)!.profile_id, distribution_ratio: t.percent / 100 })),
      image_url: card.needs_image ? imageUrl : null,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "作れませんでした"); return; }
    onDone(card.card_id, { kind: "qr_created", event_id: String(r.eventId), qr_config_id: String(r.qrConfigId), label: String(r.label) },
      `（QR「${String(r.label)}」を作りました${card.event.draft ? "。イベントが承認されるまでは確認用で、決済はできません" : ""}）`);
  };

  const personRow = (i: number, forRecipient: boolean) => {
    const slot = card.people[i];
    if (slotDecided(slot)) return <span className="text-slate-200">{slot.options[0].name}{forRecipient && slot.options[0].role === "organizer" ? "（主催者名義）" : ""}</span>;
    return (
      <div className="space-y-1">
        <p className="text-slate-400">{slot.exact ? `「${slot.query}」に当たる候補が${slot.options.length}つあります。選んでください` : `「${slot.query}」と同じ名前の人はいません。この中にいれば選んでください`}</p>
        {slot.options.map((o) => (
          <label key={key(o)} className="flex items-center gap-1.5 text-slate-200">
            <input type="radio" name={`${card.card_id}-${i}`} disabled={!!done} checked={picked[i] === key(o)} onChange={() => setPicked((p) => p.map((v, j) => (j === i ? key(o) : v)))} />
            {o.name}{forRecipient ? <span className="text-slate-500">（{o.role === "organizer" ? "主催者名義" : "出演者名義"}）</span> : null}
          </label>
        ))}
      </div>
    );
  };

  return (
    <div className={box} data-cheery-card="qr_create">
      <p className="text-[11px] font-black text-white flex items-center gap-1"><QrCode size={12} className="text-pink-400" /> QR の確認</p>
      <Row k="イベント" v={card.event.title} />
      <Row k="タイプ" v={`${QR_TYPE_LABEL[card.product_type]}${card.payment_type ? `・${QR_PAYMENT_LABEL[card.payment_type]}` : ""}`} />
      {done ? <Row k="ラベル" v={label.trim()} /> : (
        <LabelBox label={label} setLabel={setLabel} labelOk={labelOk} setLabelOk={setLabelOk} suggestions={suggestions}
          saidLabel={card.label} productType={card.product_type} recipientName={recipient?.name ?? null} />
      )}
      <Row k="金額" v={card.min_amount === card.max_amount ? yen(card.min_amount) : `${yen(card.min_amount)}〜${yen(card.max_amount)}`} />
      {card.payment_type && <Row k="上限数" v={card.stock_limit ?? "無制限"} />}
      {card.sales_start_at && card.sales_end_at && <Row k="販売期間" v={`${jstDateTime(card.sales_start_at)}〜${jstDateTime(card.sales_end_at)}`} />}
      <div className="flex gap-2 text-[11px]">
        <span className="w-14 shrink-0 text-slate-500">宛先</span>
        <div className="flex-1 min-w-0">
          {card.recipient_said ? personRow(card.recipient, true) : done ? <span className="text-slate-200">{recipient?.name}</span> : (
            <div className="space-y-1" data-qr-recipient>
              <p className="text-[10px] leading-snug text-slate-300">{RECIPIENT_GUIDE}。配分先の中から1人選んでください</p>
              {targetOptions.length === 0 && <p className="text-slate-400">先に配分先の人を選んでください</p>}
              {targetOptions.map((o) => (
                <label key={key(o)} className="flex items-center gap-1.5 text-slate-200">
                  <input type="radio" name={`${card.card_id}-recipient`} checked={recipientChoice === key(o)} onChange={() => setRecipientChoice(key(o))} />
                  {o.name}<span className="text-slate-500">（{o.role === "organizer" ? "主催者名義・迷ったらこちら" : "出演者名義"}）</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2 text-[11px]">
        <span className="w-14 shrink-0 text-slate-500">配分</span>
        <div className="flex-1 min-w-0 space-y-1">
          {card.targets.map((t) => (
            <div key={t.person} className="flex gap-2">
              <div className="flex-1 min-w-0">{card.recipient_said && t.person === card.recipient ? <span className="text-slate-200">{recipient?.name ?? card.people[t.person].query}</span> : personRow(t.person, false)}</div>
              <span className="shrink-0 text-slate-200">{t.percent}%</span>
            </div>
          ))}
        </div>
      </div>
      {card.needs_image && !done && (
        recipient?.avatar_url || card.flyer_url ? (
          <div className="space-y-1.5" data-qr-image>
            <QRImageUpload
              required
              allowUpload={false}
              sources={{
                recipient: recipient?.avatar_url ? { url: recipient.avatar_url, originalUrl: recipient.avatar_original_url, name: recipient.name } : null,
                flyerUrl: card.flyer_url,
              }}
              onUploadComplete={(url) => { setImageUrl(url); setImageOk(false); }}
            />
            <p className="text-[10px] leading-snug text-slate-300">{IMAGE_RIGHTS_GUIDE}</p>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-200">
              <input type="checkbox" checked={imageOk} disabled={!imageUrl} onChange={(e) => setImageOk(e.target.checked)} />
              著作権・肖像権に問題のない画像です
            </label>
          </div>
        ) : (
          <p className="text-[10px] text-slate-400">
            宛先の画像もフライヤーも無いので、QR の画像は作成画面でアップロードしてください：
            <Link href={createHref} onClick={onNavigate} className="ml-1 text-indigo-300 font-bold">作成画面を開く</Link>
          </p>
        )
      )}
      {done?.kind === "qr_created" ? (
        <>
          <p className="flex items-center gap-1 text-[11px] font-bold text-emerald-300"><Check size={12} /> QR を作りました</p>
          <Link href={`/dashboard/events/${done.event_id}/qr/${done.qr_config_id}`} onClick={onNavigate} className={primary + " w-fit"}>
            <ExternalLink size={11} /> QR を開く
          </Link>
        </>
      ) : (
        <>
          <p className={notice}>
            宛先・配分先の人に通知は届きません。
            {card.event.draft ? "このイベントは下書きなので、承認されるまでこの QR では決済できません（確認用）。" : ""}
            色・タッチ決済・ウェルカムチアなどは作成画面で設定できます。
          </p>
          <ul className="text-[10px] leading-snug text-slate-400 list-disc pl-4 space-y-0.5">
            {QR_AFTER_NOTES.map((n) => <li key={n}>{n}</li>)}
          </ul>
          {editing && (
            <p className="text-[10px] text-slate-400">
              直したいところをチャットで伝えてください。カードを作り直します。作成画面で直接入れることもできます：
              <Link href={createHref} onClick={onNavigate} className="ml-1 text-indigo-300 font-bold">作成画面を開く</Link>
            </p>
          )}
          {error && <p className="text-[11px] text-amber-300">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={create} disabled={busy || unresolved} className={primary}>
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} QRを作る
            </button>
            <button type="button" onClick={() => setEditing(true)} disabled={busy} className={secondary}><PencilLine size={11} /> 項目を直す</button>
          </div>
        </>
      )}
    </div>
  );
}

// ラベル（お客様に見える唯一の名前）の欄。QR の作成と変更で共用。どこに出るか・なぜ大事かの案内、誰に何を払うか分かる候補、
// 分かりにくいラベルへの注意を出し、本人が「このラベルでお客様に表示する」に印を付けるまで決まらない（直したら印は外れる）
function LabelBox({ label, setLabel, labelOk, setLabelOk, suggestions, saidLabel, productType, recipientName }: {
  label: string; setLabel: (v: string) => void; labelOk: boolean; setLabelOk: (v: boolean) => void;
  suggestions: string[]; saidLabel: string | null; productType: string; recipientName: string | null;
}) {
  const warning = labelWarning(productType, label, recipientName);
  return (
    <div className="space-y-1.5 rounded-xl border border-pink-500/40 bg-pink-500/5 px-2.5 py-2" data-qr-label>
      <p className="text-[11px] font-black text-pink-200">ラベル（お客様に見える名前）</p>
      <p className="text-[10px] leading-snug text-slate-300">{LABEL_GUIDE}。</p>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-slate-400">候補：</span>
          {suggestions.map((sug) => (
            <button key={sug} type="button" onClick={() => { setLabel(sug); setLabelOk(false); }}
              className={`text-[11px] font-bold rounded-lg px-2 py-1 border ${label === sug ? "border-pink-400 bg-pink-500/20 text-white" : "border-slate-600 text-slate-200 hover:border-pink-500/50"}`}>
              {sug}{sug === saidLabel ? <span className="ml-1 text-[9px] font-normal text-slate-400">（あなたの言葉）</span> : null}
            </button>
          ))}
        </div>
      )}
      <input value={label} maxLength={50} onChange={(e) => { setLabel(e.target.value); setLabelOk(false); }} aria-label="ラベル"
        placeholder={suggestions[0] ? `例：${suggestions[0]}` : "例：〇〇 へのチア／当日入場券"}
        className="w-full h-9 bg-slate-800 border border-slate-700 rounded-lg px-2 text-base md:text-sm font-bold text-white outline-none focus:border-pink-500/50 placeholder:text-slate-600 placeholder:font-normal" />
      {warning && <p className="text-[10px] leading-snug text-amber-300">注意：{warning}。このままでよいか確かめてください</p>}
      <label className="flex items-center gap-1.5 text-[11px] text-slate-200">
        <input type="checkbox" checked={labelOk} disabled={!label.trim()} onChange={(e) => setLabelOk(e.target.checked)} />
        「{label.trim() || "（未入力）"}」でお客様に表示する
      </label>
    </div>
  );
}

// ── QR の変更の確認カード ──────────────────────────────

function QrEditView({ card, done, onDone, onNavigate }: { card: QrEditCard; done?: CardDone } & Handlers) {
  const ch = card.change;
  const key = (o: { profile_id: string; role: string }) => `${o.profile_id}::${o.role}`;
  const [picked, setPicked] = useState<string[]>(() => card.people.map((p) => (slotDecided(p) ? key(p.options[0]) : "?")));
  const [recipientChoice, setRecipientChoice] = useState("");
  const [label, setLabel] = useState(ch.label ?? "");
  const [labelOk, setLabelOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const option = (i: number) => card.people[i].options.find((o) => key(o) === picked[i]) ?? null;
  const targetOptions = (ch.targets ?? []).map((t) => option(t.person)).filter((o): o is QrPersonOption => o != null);
  const recipient = !ch.recipient ? null : ch.recipient.said ? option(ch.recipient.person) : targetOptions.find((o) => key(o) === recipientChoice) ?? null;
  const unresolved = picked.some((p) => p === "?") || (ch.recipient && !recipient) || (ch.label !== undefined && (!labelOk || !label.trim()));
  const amount = (min: number, max: number) => (min === max ? yen(min) : `${yen(min)}〜${yen(max)}`);
  const suggestions = [...new Set([...(ch.label ? [ch.label] : []), ...labelSuggestions(card.product_type, card.payment_type, recipient?.name ?? card.current.recipient)])];
  const detailHref = `/dashboard/events/${card.event.event_id}/qr/${card.qr_config_id}`;

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await act({
      action: "edit_qr", card_id: card.card_id, qr_config_id: card.qr_config_id,
      ...(ch.label !== undefined && { label: label.trim() }),
      ...(ch.min_amount !== undefined && { min_amount: ch.min_amount, max_amount: ch.max_amount }),
      ...(ch.stock_limit !== undefined && { stock_limit: ch.stock_limit }),
      ...(recipient && { recipient_profile_id: recipient.profile_id, recipient_name_context: recipient.role }),
      ...(ch.targets && { targets: ch.targets.map((t) => ({ profile_id: option(t.person)!.profile_id, distribution_ratio: t.percent / 100 })) }),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "変えられませんでした"); return; }
    const newLabel = (r.label as string | null) ?? null;
    onDone(card.card_id, { kind: "qr_edited", event_id: String(r.eventId), qr_config_id: String(r.qrConfigId), label: newLabel }, `（QR「${newLabel ?? card.current.label ?? ""}」を変更しました）`);
  };

  const before = (v: string) => <span className="text-slate-500 line-through">{v}</span>;
  return (
    <div className={box} data-cheery-card="qr_edit">
      <p className="text-[11px] font-black text-white flex items-center gap-1"><PencilLine size={12} className="text-pink-400" /> QR の変更の確認</p>
      <Row k="イベント" v={card.event.title} />
      <Row k="QR" v={card.current.label ?? "（ラベルなし）"} />
      {ch.label !== undefined && (done ? <Row k="ラベル" v={<>{before(card.current.label ?? "なし")} → {label.trim()}</>} /> : (
        <div className="space-y-1">
          <Row k="ラベル" v={<>{before(card.current.label ?? "なし")} → 下で決めます</>} />
          <LabelBox label={label} setLabel={setLabel} labelOk={labelOk} setLabelOk={setLabelOk} suggestions={suggestions}
            saidLabel={ch.label ?? null} productType={card.product_type} recipientName={recipient?.name ?? card.current.recipient} />
        </div>
      ))}
      {ch.min_amount !== undefined && <Row k="金額" v={<>{before(amount(card.current.min_amount, card.current.max_amount))} → {amount(ch.min_amount, ch.max_amount!)}（これからの決済だけ）</>} />}
      {ch.stock_limit !== undefined && <Row k="上限数" v={<>{before(String(card.current.stock_limit ?? "無制限"))} → {ch.stock_limit}</>} />}
      {ch.recipient && (
        <div className="flex gap-2 text-[11px]">
          <span className="w-14 shrink-0 text-slate-500">宛先</span>
          <div className="flex-1 min-w-0 space-y-1">
            <p>{before(card.current.recipient)} → {recipient?.name ?? "下で選びます"}</p>
            {!ch.recipient.said && !done && (
              <div className="space-y-1" data-qr-recipient>
                <p className="text-[10px] leading-snug text-slate-300">{RECIPIENT_GUIDE}。配分先の中から1人選んでください</p>
                {targetOptions.map((o) => (
                  <label key={key(o)} className="flex items-center gap-1.5 text-slate-200">
                    <input type="radio" name={`${card.card_id}-recipient`} checked={recipientChoice === key(o)} onChange={() => setRecipientChoice(key(o))} />
                    {o.name}<span className="text-slate-500">（{o.role === "organizer" ? "主催者名義・迷ったらこちら" : "出演者名義"}）</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {ch.targets && (
        <div className="flex gap-2 text-[11px]">
          <span className="w-14 shrink-0 text-slate-500">配分</span>
          <div className="flex-1 min-w-0 space-y-1">
            <p>{before(card.current.targets.map((t) => `${t.name} ${t.percent}%`).join("、"))}</p>
            {ch.targets.map((t) => {
              const slot = card.people[t.person];
              return (
                <div key={t.person} className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    {slotDecided(slot) ? <span className="text-slate-200">{slot.options[0].name}</span> : slot.options.map((o) => (
                      <label key={key(o)} className="flex items-center gap-1.5 text-slate-200">
                        <input type="radio" name={`${card.card_id}-${t.person}`} disabled={!!done} checked={picked[t.person] === key(o)} onChange={() => setPicked((p) => p.map((v, j) => (j === t.person ? key(o) : v)))} />
                        {o.name}
                      </label>
                    ))}
                  </div>
                  <span className="shrink-0 text-slate-200">{t.percent}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {done?.kind === "qr_edited" ? (
        <>
          <p className="flex items-center gap-1 text-[11px] font-bold text-emerald-300"><Check size={12} /> 変更しました</p>
          <Link href={detailHref} onClick={onNavigate} className={primary + " w-fit"}><ExternalLink size={11} /> QR を開く</Link>
        </>
      ) : (
        <>
          <p className={notice}>
            {ch.label !== undefined || ch.recipient ? "ラベルや宛先を変えると、すでに買ったお客様の Wallet のカード・チケットにも新しい名前が出ます。" : ""}
            {ch.min_amount !== undefined ? "金額の変更は、これからの決済だけに効きます。" : ""}
            画像・色・タッチ決済・削除は QR の詳細画面で変えられます。
          </p>
          {error && <p className="text-[11px] text-amber-300">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={save} disabled={busy || !!unresolved} className={primary}>
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} 変更する
            </button>
            <Link href={detailHref} onClick={onNavigate} className={secondary}><ExternalLink size={11} /> 詳細画面で変える</Link>
          </div>
        </>
      )}
    </div>
  );
}
