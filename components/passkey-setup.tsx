"use client";

import { useState } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { createBrowserClient } from "@supabase/ssr";
import { Fingerprint, Loader2, CheckCircle2, ChevronRight } from "lucide-react";

type Props = {
  email?: string;
  mode: "register" | "authenticate" | "stepup" | "stepup-register";
  deviceName?: string;
  buttonLabel?: string;
  onSuccess?: () => void;
};

// stepup系API（getUser()必須）は、放置端末で裏のセッションが切れていると
// 401 Unauthorizedを返す。パスキー自体は成功していても素っ気ないエラーが
// 出るだけで「パスキーが壊れている」ように誤解されるため、この場合だけは
// エラー表示せず再ログインへ誘導する。
function redirectToLoginIfUnauthorized(message: string): boolean {
  if (message !== "Unauthorized") return false;
  const redirectTo = window.location.pathname + window.location.search;
  window.location.href = `/auth/login?redirect=${encodeURIComponent(redirectTo)}`;
  return true;
}

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
        const { error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: session_token,
          type: "magiclink",
        });
        if (otpErr) throw new Error(`セッション確立失敗: ${otpErr.message}`);
      }

      setStatus("success");
      onSuccess?.();
    } catch (err: any) {
      if (err.name === "NotAllowedError") { setStatus("idle"); return; }
      setErrorMsg(err.message ?? "エラーが発生しました");
      setStatus("error");
    }
  };

  const handleAuthenticate = async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      // 1. オプション取得（emailなしでも可 → デバイス上の全パスキーをピッカーで表示）
      const optRes = await fetch("/api/passkeys/auth-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(email ? { email } : {}),
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
        const { error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: session_token,
          type: "magiclink",
        });
        if (otpErr) throw new Error(`セッション確立失敗: ${otpErr.message}`);
      }

      setStatus("success");
      onSuccess?.();
    } catch (err: any) {
      if (err.name === "NotAllowedError") { setStatus("idle"); return; }
      setErrorMsg(err.message ?? "エラーが発生しました");
      setStatus("error");
    }
  };

  const handleStepUpRegister = async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      // 1. オプション取得（現在のセッションユーザーに対して。emailは送らない）
      const optRes = await fetch("/api/passkeys/stepup-register-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_name: resolvedDeviceName }),
      });
      const { options, error: optErr } = await optRes.json();
      if (optErr) throw new Error(optErr);

      // 2. WebAuthn 登録（この端末用の新しい鍵を作る）
      const credential = await startRegistration({ optionsJSON: options });

      // 3. サーバー検証 + dc_stepup クッキー設定
      const verRes = await fetch("/api/passkeys/stepup-register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential, device_name: resolvedDeviceName }),
      });
      const { success, error: verErr } = await verRes.json();
      if (verErr) throw new Error(verErr);
      if (!success) throw new Error("Verification failed");

      setStatus("success");
      onSuccess?.();
    } catch (err: any) {
      if (err.name === "NotAllowedError") { setStatus("idle"); return; }
      if (redirectToLoginIfUnauthorized(err.message)) return;
      setErrorMsg(err.message ?? "エラーが発生しました");
      setStatus("error");
    }
  };

  const handleStepUp = async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const optRes = await fetch("/api/passkeys/auth-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(email ? { email } : {}),
      });
      const { options, error: optErr } = await optRes.json();
      if (optErr) throw new Error(optErr);

      const credential = await startAuthentication({ optionsJSON: options });

      const verRes = await fetch("/api/passkeys/stepup-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const { success, error: verErr } = await verRes.json();
      if (verErr) throw new Error(verErr);
      if (!success) throw new Error("Verification failed");

      setStatus("success");
      onSuccess?.();
    } catch (err: any) {
      if (err.name === "NotAllowedError") { setStatus("idle"); return; }
      if (redirectToLoginIfUnauthorized(err.message)) return;
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
            {mode === "register" || mode === "stepup-register" ? "パスキー登録完了！" : mode === "stepup" ? "認証完了！" : "パスキー認証成功！"}
          </p>
          {(mode === "register" || mode === "stepup-register") && (
            <p className="text-xs text-slate-500 mt-0.5">
              次回からこのデバイスで顔認証・指紋認証でログインできます
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={status === "loading" || (mode === "register" && !email) || (mode === "stepup" && !email)}
        onClick={
          mode === "register" ? handleRegister
          : mode === "stepup" ? handleStepUp
          : mode === "stepup-register" ? handleStepUpRegister
          : handleAuthenticate
        }
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
              {buttonLabel ?? (mode === "register" || mode === "stepup-register" ? "パスキーで登録" : "パスキーでログイン")}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {mode === "register" || mode === "stepup-register"
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
