"use client";

import { useRef, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

interface SignatureCanvasProps {
  onSignature: (dataUrl: string | null) => void;
}

export function SignatureCanvas({ onSignature }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const hasDrawn = useRef(false);
  const lastPos = useRef<{ x: number; y: number; pressure: number } | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // ResizeObserver でレイアウト確定後にキャンバス物理サイズを設定
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setup = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
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

    const getPoint = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        // Apple Pencil 2 は 0–1 の実圧力。指/マウスは 0.5 固定。
        pressure: e.pointerType === "pencil" && e.pressure > 0
          ? e.pressure
          : 0.5,
      };
    };

    const strokeTo = (
      ctx: CanvasRenderingContext2D,
      from: { x: number; y: number; pressure: number },
      to:   { x: number; y: number; pressure: number },
      isPencil: boolean,
    ) => {
      const avg = (from.pressure + to.pressure) / 2;
      ctx.lineWidth   = isPencil ? Math.max(0.5, avg * 8) : 2.5;
      ctx.strokeStyle = "#ffffff";
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      // 中点ベジェで滑らかに補間
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(from.x, from.y, mx, my);
      ctx.stroke();
    };

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      isDrawing.current = true;
      lastPos.current   = getPoint(e);
    };

    const onMove = (e: PointerEvent) => {
      if (!isDrawing.current || !lastPos.current) return;
      e.preventDefault();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const isPencil = e.pointerType === "pencil";
      // getCoalescedEvents で Pencil の中間サンプルも全部描く
      const events: PointerEvent[] =
        typeof e.getCoalescedEvents === "function"
          ? (e.getCoalescedEvents() as PointerEvent[])
          : [e];
      for (const ev of events) {
        const pos = getPoint(ev);
        strokeTo(ctx, lastPos.current, pos, isPencil);
        lastPos.current = pos;
      }
      hasDrawn.current = true;
    };

    const onUp = () => {
      if (hasDrawn.current) {
        setIsEmpty(false);
        // toDataURL は重いので pointerup 時のみ呼ぶ
        onSignature(canvas.toDataURL("image/png"));
      }
      isDrawing.current = false;
      lastPos.current   = null;
    };

    const onCancel = () => {
      isDrawing.current = false;
      lastPos.current   = null;
    };

    canvas.addEventListener("pointerdown",   onDown,   { passive: false });
    canvas.addEventListener("pointermove",   onMove,   { passive: false });
    canvas.addEventListener("pointerup",     onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("pointerleave",  onCancel);

    return () => {
      canvas.removeEventListener("pointerdown",   onDown);
      canvas.removeEventListener("pointermove",   onMove);
      canvas.removeEventListener("pointerup",     onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("pointerleave",  onCancel);
    };
  }, [onSignature]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
    setIsEmpty(true);
    onSignature(null);
  };

  return (
    <div className="space-y-3" style={{ touchAction: "none" }}>
      <div className="relative" style={{ touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          className="w-full h-72 bg-slate-950 border-2 border-slate-700 rounded-2xl cursor-crosshair block"
          style={{ touchAction: "none" }}
        />
        {isEmpty && (
          <p className="absolute inset-0 flex items-center justify-center text-slate-600 text-base font-bold pointer-events-none select-none">
            ここに署名してください
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
