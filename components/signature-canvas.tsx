"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { getStroke } from "perfect-freehand";

interface SignatureCanvasProps {
  onSignature: (dataUrl: string | null) => void;
}

type Point = [number, number, number]; // x, y, pressure
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
  const [isEmpty, setIsEmpty] = useState(true);

  // コンポーネントがマウントされている間、document全体の選択を封じる
  // （イベントハンドラ内でstyle変更するとiOSがpointercancelを発火するため）
  useEffect(() => {
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    (document.body.style as any).webkitUserSelect = "none";
    (document.body.style as any).webkitTouchCallout = "none";
    return () => {
      document.body.style.userSelect = prev;
      (document.body.style as any).webkitUserSelect = prev;
      (document.body.style as any).webkitTouchCallout = "";
    };
  }, []);

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
    if (cur && cur.pts.length > 1) {
      const poly = getStroke(cur.pts, { ...OPT, last: false });
      ctx.fill(new Path2D(svgPath(poly)));
    }

    ctx.restore();
  }, []);

  const schedule = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(paint);
  }, [paint]);

  // DPR・リサイズ対応
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

    const pt = (e: PointerEvent): Point => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top, e.pressure || 0.5];
    };

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

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "pen") return;
      e.preventDefault();
      e.stopPropagation();
      canvas.setPointerCapture(e.pointerId);
      currentRef.current = { pts: [pt(e)] };
      schedule();
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "pen") return;
      if (!currentRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      // 動き中に選択が始まっても即クリア
      window.getSelection()?.removeAllRanges();
      const events = e.getCoalescedEvents?.() ?? [e];
      for (const ev of events) {
        currentRef.current.pts.push(pt(ev as PointerEvent));
      }
      schedule();
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "pen") return;
      window.getSelection()?.removeAllRanges();
      const cur = currentRef.current;
      currentRef.current = null;
      if (!cur || cur.pts.length < 2) { schedule(); return; }
      strokesRef.current.push(cur);
      setIsEmpty(false);
      schedule();
      requestAnimationFrame(exportPng);
    };

    const onCancel = (e: PointerEvent) => {
      if (e.pointerType !== "pen") return;
      currentRef.current = null;
      schedule();
    };

    const prevent = (e: Event) => e.preventDefault();

    canvas.addEventListener("pointerdown",   onDown,   { passive: false });
    canvas.addEventListener("pointermove",   onMove,   { passive: false });
    canvas.addEventListener("pointerup",     onUp);
    canvas.addEventListener("pointercancel", onCancel);
    // document レベルでも選択・コンテキストメニューをブロック
    document.addEventListener("selectstart", prevent,  { passive: false });
    document.addEventListener("contextmenu", prevent,  { passive: false });

    return () => {
      window.getSelection()?.removeAllRanges();
      canvas.removeEventListener("pointerdown",   onDown);
      canvas.removeEventListener("pointermove",   onMove);
      canvas.removeEventListener("pointerup",     onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("selectstart", prevent);
      document.removeEventListener("contextmenu", prevent);
    };
  }, [onSignature, schedule]);

  const clear = () => {
    strokesRef.current = [];
    currentRef.current = null;
    setIsEmpty(true);
    onSignature(null);
    schedule();
  };

  return (
    <div
      className="space-y-3"
      style={{
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none" as any,
      }}
      onContextMenu={e => e.preventDefault()}
    >
      <div
        className="relative"
        style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-72 bg-slate-950 border-2 border-slate-700 rounded-2xl cursor-crosshair block"
          style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
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
