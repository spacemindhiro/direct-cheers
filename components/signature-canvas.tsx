"use client";

import { useRef, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

interface SignatureCanvasProps {
  onSignature: (dataUrl: string | null) => void;
}

export function SignatureCanvas({ onSignature }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // レイアウト確定後に canvas の物理サイズを設定
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setup = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };

    setup();
    const ro = new ResizeObserver(setup);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const getPos = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const applyStyle = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return ctx;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return ctx;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ---- touch events（iOS/Android）----
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      isDrawing.current = true;
      lastPos.current = getPos(canvas, t.clientX, t.clientY);
      applyStyle(canvas);
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!isDrawing.current || !lastPos.current) return;
      const t = e.touches[0];
      const ctx = applyStyle(canvas);
      if (!ctx) return;
      const pos = getPos(canvas, t.clientX, t.clientY);
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastPos.current = pos;
      setIsEmpty(false);
      onSignature(canvas.toDataURL("image/png"));
    };

    const onTouchEnd = () => {
      isDrawing.current = false;
      lastPos.current = null;
    };

    // ---- mouse events（デスクトップ）----
    const onMouseDown = (e: MouseEvent) => {
      isDrawing.current = true;
      lastPos.current = getPos(canvas, e.clientX, e.clientY);
      applyStyle(canvas);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDrawing.current || !lastPos.current) return;
      const ctx = applyStyle(canvas);
      if (!ctx) return;
      const pos = getPos(canvas, e.clientX, e.clientY);
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastPos.current = pos;
      setIsEmpty(false);
      onSignature(canvas.toDataURL("image/png"));
    };

    const onMouseEnd = () => {
      isDrawing.current = false;
      lastPos.current = null;
    };

    canvas.addEventListener("touchstart",  onTouchStart,  { passive: false });
    canvas.addEventListener("touchmove",   onTouchMove,   { passive: false });
    canvas.addEventListener("touchend",    onTouchEnd);
    canvas.addEventListener("touchcancel", onTouchEnd);
    canvas.addEventListener("mousedown",   onMouseDown);
    canvas.addEventListener("mousemove",   onMouseMove);
    canvas.addEventListener("mouseup",     onMouseEnd);
    canvas.addEventListener("mouseleave",  onMouseEnd);

    return () => {
      canvas.removeEventListener("touchstart",  onTouchStart);
      canvas.removeEventListener("touchmove",   onTouchMove);
      canvas.removeEventListener("touchend",    onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
      canvas.removeEventListener("mousedown",   onMouseDown);
      canvas.removeEventListener("mousemove",   onMouseMove);
      canvas.removeEventListener("mouseup",     onMouseEnd);
      canvas.removeEventListener("mouseleave",  onMouseEnd);
    };
  }, [onSignature]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    onSignature(null);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-56 bg-slate-950 border border-slate-700 rounded-2xl cursor-crosshair"
          style={{ touchAction: "none" }}
        />
        {isEmpty && (
          <p className="absolute inset-0 flex items-center justify-center text-slate-700 text-sm font-bold pointer-events-none">
            ここに署名してください
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 hover:text-red-400 uppercase tracking-widest transition-colors"
      >
        <Trash2 size={12} /> クリア
      </button>
    </div>
  );
}
