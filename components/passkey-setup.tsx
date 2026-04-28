"use client";

import { useState } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { createBrowserClient } from "@supabase/ssr";
import { Fingerprint, Loader2, CheckCircle2, ChevronRight } from "lucide-react";

type Props = {
  email: string;
  mode: "register" | "authenticate";
  deviceName?: string;
  buttonLabel?: string;
  onSuccess?: () => void;
};

function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua) && /Mobile/.test(ua)) return "Android";
  if (/Android/.test(ua)) return "Androidタブレット";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "";
}

export function PasskeySetup({ email, mode, deviceName, buttonLabel, onSuccess }: Props) {
  const resolvedDeviceName = deviceName || getDeviceLabel() || undefined;
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const handleRegister = async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      // 1. オプション取得
      const optRes = await fetch("/api/passkeys/register-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, device_name: resolvedDeviceName }),
      });
      const { options, error: optErr } = await optRes.json();
      if (optErr) throw new Error(optErr);

      // 2. WebAuthn 登録
      const credential = await startRegistration({ optionsJSON: options });

      // 3. サーバー検証
      const verRes = await fetch("/api/passkeys/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, credential, device_name: resolvedDeviceName }),
      });
      const { success, session_token, error: verErr } = await verRes.json();
      if (verErr) throw new Error(verErr);
      if (!success) throw new Error("Verification failed");

      // 4. セッション確立
      if (session_token) {
        await supabase.auth.verifyOtp({
          token_hash: session_token,
          type: "magiclink",
        });
      }

      setStatus("success");
      onSuccess?.();
    } catch (err: any) {
      setErrorMsg(err.message ?? "エラーが発生しました");
      setStatus("error");
    }
  };

  const handleAuthenticate = async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      // 1. オプション取得
      const optRes = await fetch("/api/passkeys/auth-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const { options, error: optErr } = await optRes.json();
      if (optErr) throw new Error(optErr);

      // 2. WebAuthn 認証
      const credential = await startAuthentication({ optionsJSON: options });

      // 3. サーバー検証
      const verRes = await fetch("/api/passkeys/auth-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const { success, session_token, error: verErr } = await verRes.json();
      if (verErr) throw new Error(verErr);
      if (!success) throw new Error("Verification failed");

      // 4. セッション確立
      if (session_token) {
        await supabase.auth.verifyOtp({
          token_hash: session_token,
          type: "magiclink",
        });
      }

      setStatus("success");
      onSuccess?.();
    } catch (err: any) {
      setErrorMsg(err.message ?? "エラーが発生しました");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-2xl p-4">
        <CheckCircle2 size={20} className="text-green-400 shrink-0" />
        <div>
          <p className="text-sm font-black text-green-400">
            {mode === "register" ? "パスキー登録完了！" : "認証成功！"}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            次回からこのデバイスで顔認証・指紋認証でログインできます
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={status === "loading" || (mode === "authenticate" && !email)}
        onClick={mode === "register" ? handleRegister : handleAuthenticate}
        className="w-full flex items-center justify-between gap-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl p-4 transition-all active:scale-[0.98] disabled:opacity-60"
      >
        <div className="flex items-center gap-3">
          {status === "loading" ? (
            <Loader2 size={22} className="text-pink-500 animate-spin shrink-0" />
          ) : (
            <Fingerprint size={22} className="text-pink-500 shrink-0" />
          )}
          <div className="text-left">
            <p className="text-sm font-black text-white">
              {buttonLabel ?? (mode === "register" ? "パスキーで登録" : "パスキーでログイン")}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {mode === "register"
                ? "Face ID / Touch ID / 指紋認証でウォレットを作成"
                : "Face ID / Touch ID で続きを見る"}
            </p>
          </div>
        </div>
        <ChevronRight size={16} className="text-slate-600 shrink-0" />
      </button>

      {status === "error" && (
        <p className="text-xs text-red-400 text-center px-2">{errorMsg}</p>
      )}
    </div>
  );
}
