"use client";

import { useRef, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

interface SignatureCanvasProps {
  onSignature: (dataUrl: string | null) => void;
}

type DrawPoint = { x: number; y: number; pressure: number };

// WebKit 拡張: Apple Pencil は touchType === "stylus" を返す
const isStylus = (t: Touch) => (t as Touch & { touchType?: string }).touchType === "stylus";

const findStylus = (list: TouchList): Touch | null => {
  for (let i = 0; i < list.length; i++) {
    if (isStylus(list[i])) return list[i];
  }
  return null;
};

export function SignatureCanvas({ onSignature }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const hasDrawn  = useRef(false);
  const lastPoint = useRef<DrawPoint | null>(null);
  const lastMid   = useRef<{ x: number; y: number } | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setup = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr  = window.devicePixelRatio || 1;
      const newW = Math.round(rect.width  * dpr);
      const newH = Math.round(rect.height * dpr);
      // サイズ未変更ならリセット不要（描画内容を保持する）
      if (canvas.width === newW && canvas.height === newH) return;
      canvas.width  = newW;
      canvas.height = newH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
    };
    setup();
    const ro = new ResizeObserver(setup);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const fromTouch = (touch: Touch): DrawPoint => {
      const rect  = canvas.getBoundingClientRect();
      const force = (touch as Touch & { force?: number }).force ?? 0;
      return {
        x:        touch.clientX - rect.left,
        y:        touch.clientY - rect.top,
        pressure: force > 0 ? force : 0.5,
      };
    };

    const drawTo = (ctx: CanvasRenderingContext2D, to: DrawPoint) => {
      const from = lastPoint.current!;
      const avgP = (from.pressure + to.pressure) / 2;
      const w    = Math.max(0.5, avgP * 8);

      ctx.strokeStyle = "#0f172a";
      ctx.fillStyle   = "#0f172a";
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.lineWidth   = w;

      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;

      ctx.beginPath();
      if (lastMid.current) {
        ctx.moveTo(lastMid.current.x, lastMid.current.y);
        ctx.quadraticCurveTo(from.x, from.y, mx, my);
      } else {
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(mx, my);
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(mx, my, w / 2, 0, Math.PI * 2);
      ctx.fill();

      lastMid.current   = { x: mx, y: my };
      lastPoint.current = to;
    };

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const stylus = findStylus(e.changedTouches);
      if (!stylus) return; // Apple Pencil 以外は無視
      const pt = fromTouch(stylus);
      isDrawing.current = true;
      lastPoint.current = pt;
      lastMid.current   = null;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        const w = Math.max(0.5, pt.pressure * 8);
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, w / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!isDrawing.current || !lastPoint.current) return;
      const stylus = findStylus(e.changedTouches);
      if (!stylus) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawTo(ctx, fromTouch(stylus));
      hasDrawn.current = true;
    };

    const onTouchEnd = (e: TouchEvent) => {
      // Apple Pencil が離れた時だけ終了。手のひら等の touchend は無視。
      const stylus = findStylus(e.changedTouches);
      if (!stylus) return;
      if (!isDrawing.current) return;
      if (hasDrawn.current) {
        setIsEmpty(false);
        onSignature(canvas.toDataURL("image/png"));
      }
      isDrawing.current = false;
      lastPoint.current = null;
      lastMid.current   = null;
    };

    canvas.addEventListener("touchstart",  onTouchStart, { passive: false });
    canvas.addEventListener("touchmove",   onTouchMove,  { passive: false });
    canvas.addEventListener("touchend",    onTouchEnd);
    canvas.addEventListener("touchcancel", onTouchEnd);

    return () => {
      canvas.removeEventListener("touchstart",  onTouchStart);
      canvas.removeEventListener("touchmove",   onTouchMove);
      canvas.removeEventListener("touchend",    onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [onSignature]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current  = false;
    lastPoint.current = null;
    lastMid.current   = null;
    setIsEmpty(true);
    onSignature(null);
  };

  return (
    <div className="space-y-3" style={{ touchAction: "none" }}>
      <div className="relative" style={{ touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          className="w-full h-72 bg-white border-2 border-slate-300 rounded-2xl cursor-crosshair block"
          style={{ touchAction: "none" }}
        />
        {isEmpty && (
          <p className="absolute inset-0 flex items-center justify-center text-slate-400 text-base font-bold pointer-events-none select-none">
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
