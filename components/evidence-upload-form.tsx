"use client";

import { useState } from "react";
import { Upload, Loader2, CheckCircle2, X } from "lucide-react";
import { useRouter } from "next/navigation";

type Props = {
  eventId: string;
};

export function EvidenceUploadForm({ eventId }: Props) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [attendanceCount, setAttendanceCount] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

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
    if (!(await isHeic(file))) return file;
    const { default: heic2any } = await import("heic2any");
    const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(result) ? result[0] : result;
    if (!blob || blob.size === 0) throw new Error("HEIC変換結果が空でした");
    return new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;
    setConverting(true);
    setError("");
    try {
      const converted = await Promise.all(selected.map(convertIfHeic));
      const next = [...files, ...converted].slice(0, 10);
      setFiles(next);
      setPreviews(next.map((f) => URL.createObjectURL(f)));
    } catch {
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
      // 1. 署名付きURLを取得してクライアントから直接Supabase Storageにアップロード
      //    （Next.js/Vercelのボディサイズ制限を完全にバイパス）
      const uploadedPaths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // 1a. サーバーから署名付きURLを取得（ファイル名だけ送る小さいリクエスト）
        const urlRes = await fetch(`/api/events/${eventId}/evidence/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name }),
        });
        if (!urlRes.ok) {
          const urlData = await urlRes.json().catch(() => ({}));
          throw new Error(`写真${i + 1}枚目: ${(urlData as { error?: string }).error ?? "URL取得失敗"}`);
        }
        const { path, signedUrl, contentType } = await urlRes.json() as {
          path: string;
          signedUrl: string;
          contentType: string;
        };

        // 1b. 署名付きURLに直接PUT（Vercelを経由しない）
        const putRes = await fetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: file,
        });
        if (!putRes.ok) {
          throw new Error(`写真${i + 1}枚目: アップロード失敗 (HTTP ${putRes.status})`);
        }
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
