"use client";

import { useRef, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

interface SignatureCanvasProps {
  onSignature: (dataUrl: string | null) => void;
}

export function SignatureCanvas({ onSignature }: SignatureCanvasProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const isDrawing  = useRef(false);
  const hasDrawn   = useRef(false);
  const lastPoint  = useRef<{ x: number; y: number; pressure: number } | null>(null);
  const lastMid    = useRef<{ x: number; y: number } | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // ResizeObserver でレイアウト後にキャンバス物理サイズを確定
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
        pressure: e.pressure > 0 ? e.pressure : 0.5,
      };
    };

    /**
     * 1セグメントを描く
     * - 前の中点 → 今の中点を quadraticCurveTo（制御点=前の実点）で滑らかに接続
     * - 各サンプル点に塗りつぶし円を重ねてギャップを完全に埋める
     */
    const drawTo = (
      ctx: CanvasRenderingContext2D,
      to: { x: number; y: number; pressure: number },
    ) => {
      const from = lastPoint.current!;
      const avgP = (from.pressure + to.pressure) / 2;
      const w    = Math.max(1, avgP * 8); // 圧力 0→1 = 線幅 1→8px

      ctx.strokeStyle = "#ffffff";
      ctx.fillStyle   = "#ffffff";
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.lineWidth   = w;

      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;

      ctx.beginPath();
      if (lastMid.current) {
        // 前の中点から今の中点へ、前の実点を制御点とした曲線
        ctx.moveTo(lastMid.current.x, lastMid.current.y);
        ctx.quadraticCurveTo(from.x, from.y, mx, my);
      } else {
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(mx, my);
      }
      ctx.stroke();

      // セグメント間のギャップを塗りつぶし円で埋める
      ctx.beginPath();
      ctx.arc(mx, my, w / 2, 0, Math.PI * 2);
      ctx.fill();

      lastMid.current   = { x: mx, y: my };
      lastPoint.current = to;
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "pencil") return; // Apple Pencil 2 のみ
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch { /**/ }
      const pt = getPoint(e);
      isDrawing.current  = true;
      lastPoint.current  = pt;
      lastMid.current    = null; // stroke 開始時はリセット

      // 点描き（最初のタッチ点を即時描画）
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const w = Math.max(1, pt.pressure * 8);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, w / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "pencil") return;
      if (!isDrawing.current || !lastPoint.current) return;
      e.preventDefault();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const events: PointerEvent[] =
        typeof e.getCoalescedEvents === "function"
          ? (e.getCoalescedEvents() as PointerEvent[])
          : [e];

      for (const ev of events) {
        drawTo(ctx, getPoint(ev));
      }
      hasDrawn.current = true;
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "pencil") return;
      if (hasDrawn.current) {
        setIsEmpty(false);
        onSignature(canvas.toDataURL("image/png"));
      }
      isDrawing.current = false;
      lastPoint.current = null;
      lastMid.current   = null;
    };

    const onCancel = (e: PointerEvent) => {
      if (e.pointerType !== "pencil") return;
      isDrawing.current = false;
      lastPoint.current = null;
      lastMid.current   = null;
    };

    canvas.addEventListener("pointerdown",   onDown,   { passive: false });
    canvas.addEventListener("pointermove",   onMove,   { passive: false });
    canvas.addEventListener("pointerup",     onUp);
    canvas.addEventListener("pointercancel", onCancel);

    return () => {
      canvas.removeEventListener("pointerdown",   onDown);
      canvas.removeEventListener("pointermove",   onMove);
      canvas.removeEventListener("pointerup",     onUp);
      canvas.removeEventListener("pointercancel", onCancel);
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
          className="w-full h-72 bg-slate-950 border-2 border-slate-700 rounded-2xl cursor-crosshair block"
          style={{ touchAction: "none" }}
        />
        {isEmpty && (
          <p className="absolute inset-0 flex items-center justify-center text-slate-600 text-base font-bold pointer-events-none select-none">
            Apple Pencil で署名してください
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
