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
  size: 8,
  thinning: 0.72,   // 筆圧で太細が出る（止め・はね・払いの表現）
  smoothing: 0.5,
  streamline: 0,
  simulatePressure: false,
  easing: (t: number) => Math.sin((t * Math.PI) / 2),
  start: { cap: true, taper: 4,  easing: (t: number) => t * t },
  end:   { cap: true, taper: 22, easing: (t: number) => t * t }, // 払いの抜け
};

// Apple Pencil のタッチを識別する
// touchType === "stylus" が明示的なPencil判定（iOS標準）
// フォールバック: 接触半径が小さく圧力がある = Pencilの可能性が高い
function findPencil(touches: TouchList): Touch | null {
  for (const t of Array.from(touches)) {
    if ((t as any).touchType === "stylus") return t;
  }
  // touchType非対応環境向けフォールバック
  for (const t of Array.from(touches)) {
    if (t.radiusX < 3 && t.force > 0) return t;
  }
  return null;
}

export function SignatureCanvas({ onSignature }: SignatureCanvasProps) {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const strokesRef     = useRef<Stroke[]>([]);
  const currentRef     = useRef<Stroke | null>(null);
  const rafRef         = useRef<number | null>(null);
  const activeTouchId  = useRef<number | null>(null);
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
      ctx.fill(new Path2D(svgPath(getStroke(pts, { ...OPT, last: true }))));
    }
    const cur = currentRef.current;
    if (cur && cur.pts.length > 0) {
      ctx.fill(new Path2D(svgPath(getStroke(cur.pts, { ...OPT, last: false }))));
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

    const r = () => canvas.getBoundingClientRect();

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
        ctx.fill(new Path2D(svgPath(getStroke(pts, { ...OPT, last: true }))));
      }
      ctx.restore();
      onSignature(exp.toDataURL("image/png"));
    };

    const commitStroke = () => {
      activeTouchId.current = null;
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

    // ── Touch Events（iOS Apple Pencil 最優先） ──────────────────────────
    const onTouchStart = (e: TouchEvent) => {
      const pencil = findPencil(e.changedTouches);
      if (!pencil) return;
      e.preventDefault();
      e.stopPropagation();
      activeTouchId.current = pencil.identifier;
      const rect = r();
      currentRef.current = { pts: [[
        pencil.clientX - rect.left,
        pencil.clientY - rect.top,
        pencil.force || 0.5,
      ]] };
      schedule();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (activeTouchId.current === null || !currentRef.current) return;
      const touch = Array.from(e.changedTouches).find(
        t => t.identifier === activeTouchId.current
      );
      if (!touch) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = r();
      currentRef.current.pts.push([
        touch.clientX - rect.left,
        touch.clientY - rect.top,
        touch.force || 0.5,
      ]);
      schedule();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (activeTouchId.current === null) return;
      const touch = Array.from(e.changedTouches).find(
        t => t.identifier === activeTouchId.current
      );
      if (!touch) return;
      commitStroke();
    };

    const onTouchCancel = (e: TouchEvent) => {
      if (activeTouchId.current === null) return;
      commitStroke(); // キャンセルでも保存
    };

    // ── 選択モード封じ ────────────────────────────────────────────────────
    const prevent = (e: Event) => e.preventDefault();

    // canvasに直接登録（passive:falseでpreventDefault可能に）
    canvas.addEventListener("touchstart",   onTouchStart,  { passive: false });
    canvas.addEventListener("touchmove",    onTouchMove,   { passive: false });
    canvas.addEventListener("touchend",     onTouchEnd,    { passive: false });
    canvas.addEventListener("touchcancel",  onTouchCancel, { passive: false });
    document.addEventListener("selectstart", prevent, { passive: false });
    document.addEventListener("contextmenu", prevent, { passive: false });

    return () => {
      canvas.removeEventListener("touchstart",   onTouchStart);
      canvas.removeEventListener("touchmove",    onTouchMove);
      canvas.removeEventListener("touchend",     onTouchEnd);
      canvas.removeEventListener("touchcancel",  onTouchCancel);
      document.removeEventListener("selectstart", prevent);
      document.removeEventListener("contextmenu", prevent);
    };
  }, [onSignature, schedule]);

  const clear = () => {
    strokesRef.current = [];
    currentRef.current = null;
    activeTouchId.current = null;
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
