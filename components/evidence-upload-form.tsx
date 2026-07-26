"use client";

import { useState } from "react";
import { Upload, Loader2, CheckCircle2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  eventId: string;
};

export function EvidenceUploadForm({ eventId }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [description, setDescription] = useState("");
  const [attendanceCount, setAttendanceCount] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  // TODO(調査用・恒久対応後に削除): 本番でアップロードした写真が0バイトになる
  // 事象の原因究明のため、実機の画面上でファイルサイズの推移を直接確認できる
  // よう一時的に仕込んでいるデバッグ表示。
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const log = (msg: string) => setDebugLog((prev) => [...prev, `${new Date().toLocaleTimeString("ja-JP")} ${msg}`]);

  // iPhoneのカメラで撮った写真はデフォルトでHEIC形式だが、ブラウザの<img>タグでは
  // 表示できない（保存自体は成功するため、証跡ページで壊れた画像アイコンになって
  // 初めて気づく）。選択された時点でJPEGに変換しておき、プレビュー・保存とも
  // 常に表示可能な形式で扱う。
  //
  // 判定はfile.name/file.typeに頼らず、実バイト列の先頭(ftypボックス)を見て行う。
  // iOS Safariは<input type="file">経由で渡す際にHEICを内部的にJPEGへ変換済みの
  // ことがあるが、その場合もファイル名は".HEIC"のまま・file.typeも不正確なことがある。
  // 名前だけで判定すると、既にJPEGのバイト列を誤ってHEICデコーダに渡してしまい、
  // デコード失敗で空のBlobが返り、エラーも出ないまま0バイトのファイルが
  // アップロードされてしまっていた（本番で実際に発生・確認済み）。
  const isHeic = async (file: File): Promise<boolean> => {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (head.length < 12) return false;
    const isFtypBox = head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70; // 'ftyp'
    if (!isFtypBox) return false;
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
    return ["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"].includes(brand);
  };

  const convertIfHeic = async (file: File): Promise<File> => {
    log(`選択: ${file.name} size=${file.size} type=${file.type || "(空)"}`);
    const heic = await isHeic(file);
    log(`HEIC判定: ${heic} (この時点でのfile.size=${file.size})`);
    if (!heic) return file;
    const { default: heic2any } = await import("heic2any");
    const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(result) ? result[0] : result;
    log(`heic2any変換結果: size=${blob?.size ?? "(null)"}`);
    if (!blob || blob.size === 0) throw new Error("HEIC変換結果が空でした");
    const converted = new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
    log(`変換後File: size=${converted.size}`);
    return converted;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;
    log(`input選択イベント: ${selected.length}件`);
    setConverting(true);
    setError("");
    try {
      const converted = await Promise.all(selected.map(convertIfHeic));
      const next = [...files, ...converted].slice(0, 10);
      setFiles(next);
      setPreviews(next.map((f) => URL.createObjectURL(f)));
      log(`files state更新後: ${next.map((f) => f.size).join(",")}`);
    } catch (err) {
      log(`変換エラー: ${err instanceof Error ? err.message : String(err)}`);
      setError("写真の変換に失敗しました。別の写真でお試しください");
    } finally {
      setConverting(false);
    }
  };

  const removeFile = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError("");

    try {
      // サーバー経由（Vercel APIルートでformData()を解析）だと、iPhoneの
      // 生の写真サイズ(2〜4MB)でmultipart境界が失われるエラーが本番で
      // 再現し続けた（fetch/XHRどちらでも同じ）。Supabase公式ドキュメントが
      // 6MB未満のファイルに推奨している標準アップロード方式（ブラウザから
      // supabase-js経由で直接ストレージへ書き込む）に切り替える。
      // 直接書き込みには対象イベントの主催者/担当エージェント/管理者のみ
      // 許可するRLSポリシーが必要（migration側で追加、アプリのAPIルートが
      // 既に行っている認可条件をDB側に複製したもの）。
      const uploadedPaths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        log(`アップロード開始 ${i + 1}枚目: ${file.name} size=${file.size}`);

        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const baseName = (file.name.replace(/\.[^.]+$/, "") || "photo").replace(/[^a-zA-Z0-9_-]/g, "_") || "photo";
        const path = `${eventId}/${crypto.randomUUID()}-${baseName}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("event-evidence")
          .upload(path, file, { contentType: file.type || "image/jpeg" });
        if (uploadError) {
          log(`直接アップロードエラー: ${uploadError.message}`);
          throw new Error(`写真${i + 1}枚目: ${uploadError.message}`);
        }
        log(`直接アップロード成功: path=${path}`);
        uploadedPaths.push(path);
      }

      // 2. パスを証跡APIに送信
      const res = await fetch(`/api/events/${eventId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description || null,
          photo_paths: uploadedPaths,
          attendance_count: attendanceCount ? parseInt(attendanceCount) : null,
        }),
      });

      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || (data as { error?: string }).error)
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);

      setSubmitted(true);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setUploading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-2xl p-5">
        <CheckCircle2 size={22} className="text-green-400 shrink-0" />
        <div>
          <p className="font-black text-green-400">証跡を提出しました</p>
          <p className="text-xs text-slate-500 mt-0.5">管理者が確認後、精算処理が実行されます</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 調査用デバッグ表示（恒久対応後に削除） */}
      {debugLog.length > 0 && (
        <div className="bg-black border border-red-500/50 rounded-xl p-3 space-y-0.5 max-h-48 overflow-y-auto">
          <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-1">Debug Log</p>
          {debugLog.map((l, i) => (
            <p key={i} className="text-[9px] text-green-400 font-mono break-all">{l}</p>
          ))}
        </div>
      )}

      {/* 写真アップロード */}
      <div className="space-y-2">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">写真（最大10枚）</p>
        <label className={`flex flex-col items-center justify-center h-32 bg-slate-800 border-2 border-dashed border-slate-700 rounded-2xl transition-colors ${converting ? "opacity-60" : "cursor-pointer hover:border-pink-500/40"}`}>
          {converting ? (
            <>
              <Loader2 size={20} className="text-slate-600 mb-2 animate-spin" />
              <p className="text-xs text-slate-500">写真を変換中...</p>
            </>
          ) : (
            <>
              <Upload size={20} className="text-slate-600 mb-2" />
              <p className="text-xs text-slate-500">クリックして写真を選択</p>
            </>
          )}
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            disabled={converting}
            onChange={handleFileChange}
          />
        </label>

        {previews.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative group">
                <div className="w-16 h-16 bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
                  <img src={src} alt={files[i]?.name} className="w-full h-full object-cover" />
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-slate-900 border border-slate-700 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} className="text-slate-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 動員数 */}
      <div className="space-y-2">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">動員数</p>
        <input
          type="text"
          inputMode="numeric"
          value={attendanceCount}
          onChange={(e) => setAttendanceCount(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="例: 150"
          className="w-full h-12 bg-slate-800 border border-slate-700 rounded-2xl px-4 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 outline-none"
        />
      </div>

      {/* コメント */}
      <div className="space-y-2">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">コメント（任意）</p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="イベントの実施報告、特記事項など"
          rows={3}
          className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-4 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 outline-none resize-none"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={uploading || converting || files.length === 0}
        className="w-full h-12 bg-pink-500 hover:brightness-110 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {uploading ? (
          <><Loader2 size={16} className="animate-spin" />アップロード中...</>
        ) : (
          <>開催証跡を提出して承認依頼する</>
        )}
      </button>
    </div>
  );
}
