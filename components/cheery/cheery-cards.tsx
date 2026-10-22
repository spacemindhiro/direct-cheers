"use client";

// チアリー(AI) の確認カード（イベントの下書き・会場の登録・ピンを置く地図）。
// 材料はサーバーがツールの結果から作ったもの（lib/cheery/cards.ts）。ボタンを押したときだけ /api/cheery/action に送る。
// まだ誰にも届いていないこと・登録した会場は全主催者が選べることを必ず書く（requirements.md 9章、p5-design.md）。
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarPlus, Check, ExternalLink, Loader2, LocateFixed, MapPin, PencilLine } from "lucide-react";
import { jstDateTime } from "@/lib/mcp/format";
import { slotDecided, type CardDone, type CheeryCard, type EventDraftCard, type VenuePinCard, type VenueRegisterCard } from "@/lib/cheery/cards";

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
            まだ誰にも届いていません。出演依頼は承認依頼のときに送られます。
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
