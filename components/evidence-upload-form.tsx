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
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    const next = [...files, ...selected].slice(0, 10);
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const removeFile = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (files.length === 0) return;
    setUploading(true);
    setError("");

    try {
      // 1. ファイルを1枚ずつ順番にアップロード
      const uploadedPaths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const fd = new FormData();
        fd.append("file", files[i]);
        const uploadRes = await fetch(`/api/events/${eventId}/evidence/upload`, {
          method: "POST",
          body: fd,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(`写真${i + 1}枚目: ${uploadData.error ?? "アップロード失敗"}`);
        uploadedPaths.push(uploadData.path as string);
      }
      const uploadData = { paths: uploadedPaths };

      // 2. パスを証跡APIに送信
      const res = await fetch(`/api/events/${eventId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description || null,
          photo_paths: uploadData.paths as string[],
          attendance_count: attendanceCount ? parseInt(attendanceCount) : null,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

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
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* 写真アップロード */}
      <div className="space-y-2">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">写真（最大10枚）</p>
        <label className="flex flex-col items-center justify-center h-32 bg-slate-800 border-2 border-dashed border-slate-700 rounded-2xl cursor-pointer hover:border-pink-500/40 transition-colors">
          <Upload size={20} className="text-slate-600 mb-2" />
          <p className="text-xs text-slate-500">クリックして写真を選択</p>
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
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
          pattern="[0-9]*"
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
        type="submit"
        disabled={uploading || files.length === 0}
        className="w-full h-12 bg-pink-500 hover:brightness-110 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {uploading ? (
          <><Loader2 size={16} className="animate-spin" />アップロード中...</>
        ) : (
          <>開催証跡を提出して承認依頼する</>
        )}
      </button>
    </form>
  );
}
