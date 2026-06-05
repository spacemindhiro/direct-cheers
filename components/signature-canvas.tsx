"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { getStroke } from "perfect-freehand";

interface SignatureCanvasProps {
  onSignature: (dataUrl: string | null) => void;
}

type Point = [number, number, number];
type Stroke = { pts: Point[] };

function svgPath(poly: number[][]): string {
  if (!poly.length) return "";
  const d: (string | number)[] = ["M", poly[0][0], poly[0][1], "Q"];
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    d.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  return d.join(" ") + " Z";
}

const OPT = {
  size: 16,
  thinning: 0.72,
  smoothing: 0.5,
  streamline: 0.45,
  simulatePressure: false,
  easing: (t: number) => Math.sin((t * Math.PI) / 2),
  start: { cap: true, taper: 4,  easing: (t: number) => t * t },
  end:   { cap: true, taper: 22, easing: (t: number) => t * t },
};

export function SignatureCanvas({ onSignature }: SignatureCanvasProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const rafRef     = useRef<number | null>(null);
  const drawingRef = useRef(false); // 描画中フラグ
  const [isEmpty, setIsEmpty] = useState(true);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    for (const { pts } of strokesRef.current) {
      const poly = getStroke(pts, { ...OPT, last: true });
      ctx.fill(new Path2D(svgPath(poly)));
    }
    const cur = currentRef.current;
    if (cur && cur.pts.length > 0) {
      const poly = getStroke(cur.pts, { ...OPT, last: false });
      ctx.fill(new Path2D(svgPath(poly)));
    }
    ctx.restore();
  }, []);

  const schedule = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(paint);
  }, [paint]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setup = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(rect.width  * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width === w && canvas.height === h) return;
      canvas.width  = w;
      canvas.height = h;
      schedule();
    };
    setup();
    const ro = new ResizeObserver(setup);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [schedule]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const exportPng = () => {
      const exp = document.createElement("canvas");
      exp.width  = canvas.width;
      exp.height = canvas.height;
      const dpr  = window.devicePixelRatio || 1;
      const ctx  = exp.getContext("2d")!;
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, exp.width, exp.height);
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#ffffff";
      for (const { pts } of strokesRef.current) {
        const poly = getStroke(pts, { ...OPT, last: true });
        ctx.fill(new Path2D(svgPath(poly)));
      }
      ctx.restore();
      onSignature(exp.toDataURL("image/png"));
    };

    const ptInCanvas = (e: PointerEvent): Point | null => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      // キャンバス外でも描画中は追跡する（ペンが少しはみ出ても途切れない）
      return [x, y, e.pressure || 0.5];
    };

    // documentレベルで登録 → iOSが最初のイベントを別要素にルーティングしても必ずキャッチ
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "pen") return;
      // canvasの範囲内のみ開始
      const r = canvas.getBoundingClientRect();
      if (e.clientX < r.left - 20 || e.clientX > r.right + 20 ||
          e.clientY < r.top  - 20 || e.clientY > r.bottom + 20) return;

      e.preventDefault();
      e.stopPropagation();
      // 選択をリセット
      window.getSelection()?.removeAllRanges();
      drawingRef.current = true;
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      currentRef.current = { pts: [ptInCanvas(e)!] };
      schedule();
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "pen") return;
      if (!drawingRef.current || !currentRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      window.getSelection()?.removeAllRanges();
      const events = e.getCoalescedEvents?.() ?? [e];
      for (const ev of events) {
        const p = ptInCanvas(ev as PointerEvent);
        if (p) currentRef.current.pts.push(p);
      }
      schedule();
    };

    const commitStroke = () => {
      drawingRef.current = false;
      const cur = currentRef.current;
      currentRef.current = null;
      if (cur && cur.pts.length > 0) {
        strokesRef.current.push(cur);
        setIsEmpty(false);
        schedule();
        requestAnimationFrame(exportPng);
      } else {
        schedule();
      }
    };

    const onUp     = (e: PointerEvent) => { if (e.pointerType !== "pen") return; commitStroke(); };
    const onCancel = (e: PointerEvent) => { if (e.pointerType !== "pen") return; commitStroke(); };

    // 選択・コンテキストメニューをdocumentで封じる
    const prevent = (e: Event) => { if (drawingRef.current) e.preventDefault(); };
    const preventAll = (e: Event) => e.preventDefault();

    // capture:true で他のハンドラより先に取得
    document.addEventListener("pointerdown",   onDown,      { capture: true, passive: false });
    document.addEventListener("pointermove",   onMove,      { capture: true, passive: false });
    document.addEventListener("pointerup",     onUp,        { capture: true });
    document.addEventListener("pointercancel", onCancel,    { capture: true });
    document.addEventListener("selectstart",   preventAll,  { passive: false });
    document.addEventListener("contextmenu",   preventAll,  { passive: false });
    // 描画中のスクロールを防ぐ
    document.addEventListener("touchmove",     prevent,     { passive: false });

    return () => {
      document.removeEventListener("pointerdown",   onDown,     { capture: true });
      document.removeEventListener("pointermove",   onMove,     { capture: true });
      document.removeEventListener("pointerup",     onUp,       { capture: true });
      document.removeEventListener("pointercancel", onCancel,   { capture: true });
      document.removeEventListener("selectstart",   preventAll);
      document.removeEventListener("contextmenu",   preventAll);
      document.removeEventListener("touchmove",     prevent);
    };
  }, [onSignature, schedule]);

  const clear = () => {
    strokesRef.current = [];
    currentRef.current = null;
    drawingRef.current = false;
    setIsEmpty(true);
    onSignature(null);
    schedule();
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-72 bg-slate-950 border-2 border-slate-700 rounded-2xl cursor-crosshair block"
          style={{ touchAction: "none" }}
        />
        {isEmpty && (
          <p className="absolute inset-0 flex items-center justify-center text-slate-600 text-base font-bold pointer-events-none select-none">
            Apple Pencil でご署名ください
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        className="flex items-center gap-1.5 text-xs font-black text-slate-500 hover:text-red-400 uppercase tracking-widest transition-colors"
      >
        <Trash2 size={14} /> クリア
      </button>
    </div>
  );
}
