'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';
import { Mic2, CalendarDays, ArrowRight, Loader2, ChevronRight, UserCheck } from 'lucide-react';

type RoleType = 'artist' | 'organizer' | null;

interface RoleUpgradeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RoleUpgradeDrawer({ open, onOpenChange }: RoleUpgradeDrawerProps) {
  const [selectedRole, setSelectedRole] = useState<RoleType>(null);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    if (!selectedRole) return;

    startTransition(async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // verification_statusをpendingに、申請メッセージをsocial_linksに一時保存
      const { error } = await supabase
        .from('profiles')
        .update({
          verification_status: 'pending',
          pending_role: selectedRole,
        })
        .eq('profile_id', user.id);

      if (error) {
        toast.error('申請に失敗しました。もう一度お試しください。');
      } else {
        toast.success('申請を受け付けました。審査完了後にご連絡します。');
        onOpenChange(false);
        setSelectedRole(null);
        setMessage('');
      }
    });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-slate-900 border-slate-700 border-t max-h-[90vh]">
        {/* ハンドルバー */}
        <div className="mx-auto mt-4 h-1.5 w-12 rounded-full bg-slate-700 shrink-0" />

        <DrawerHeader className="px-6 pt-6 pb-2">
          <DrawerTitle className="text-2xl font-black text-white italic uppercase tracking-tighter">
            クリエイター申請
          </DrawerTitle>
          <DrawerDescription className="text-slate-500 text-sm">
            ロールを選択して申請してください。審査後にエージェントからご連絡します。
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-6 py-4 space-y-6 overflow-y-auto">

          {/* ロール選択 */}
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              申請するロール
            </p>

            <button
              onClick={() => setSelectedRole('artist')}
              className={`w-full p-5 rounded-2xl border text-left flex items-center gap-4 transition-all ${
                selectedRole === 'artist'
                  ? 'bg-pink-500/10 border-pink-500/50'
                  : 'bg-slate-950/50 border-slate-800 hover:border-slate-600'
              }`}
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                selectedRole === 'artist' ? 'bg-pink-500/20 text-pink-400' : 'bg-slate-800 text-slate-500'
              }`}>
                <Mic2 size={22} />
              </div>
              <div>
                <p className="font-black text-white text-sm">アーティスト / DJ</p>
                <p className="text-xs text-slate-500 mt-0.5">イベントに出演して応援を受け取る</p>
              </div>
              {selectedRole === 'artist' && (
                <div className="ml-auto w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div>
              )}
            </button>

            <button
              onClick={() => setSelectedRole('organizer')}
              className={`w-full p-5 rounded-2xl border text-left flex items-center gap-4 transition-all ${
                selectedRole === 'organizer'
                  ? 'bg-pink-500/10 border-pink-500/50'
                  : 'bg-slate-950/50 border-slate-800 hover:border-slate-600'
              }`}
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                selectedRole === 'organizer' ? 'bg-pink-500/20 text-pink-400' : 'bg-slate-800 text-slate-500'
              }`}>
                <CalendarDays size={22} />
              </div>
              <div>
                <p className="font-black text-white text-sm">オーガナイザー</p>
                <p className="text-xs text-slate-500 mt-0.5">イベントを主催してQRを発行する</p>
              </div>
              {selectedRole === 'organizer' && (
                <div className="ml-auto w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div>
              )}
            </button>
          </div>

          {/* メッセージ */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              活動内容・メッセージ <span className="text-slate-600 normal-case font-normal">（任意）</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="活動内容やSNSのURLなどを書いてください"
              rows={3}
              className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl p-4 text-sm text-white focus:border-pink-500/50 outline-none resize-none transition-all placeholder:text-slate-700"
            />
          </div>

        </div>

        <DrawerFooter className="px-6 pb-8 pt-2 space-y-3">
          <button
            onClick={handleSubmit}
            disabled={!selectedRole || isPending}
            className="w-full h-14 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <>申請する <ArrowRight size={18} /></>
            )}
          </button>
          <DrawerClose className="w-full h-12 text-slate-500 hover:text-slate-300 font-bold text-xs uppercase tracking-widest transition-colors">
            キャンセル
          </DrawerClose>
        </DrawerFooter>

      </DrawerContent>
    </Drawer>
  );
}

// ダッシュボードから呼び出すトリガーバナー
export function RoleUpgradeBanner() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-slate-900 border border-pink-500/20 rounded-[2rem] p-6 flex items-center justify-between group hover:border-pink-500/50 transition-all"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-pink-500/10 rounded-2xl flex items-center justify-center border border-pink-500/20">
            <UserCheck size={18} className="text-pink-500" />
          </div>
          <div className="text-left space-y-0.5">
            <p className="text-sm font-black text-white uppercase tracking-tight">
              クリエイターとして参加する
            </p>
            <p className="text-xs text-slate-500 font-medium">
              アーティスト・オーガナイザーへの申請
            </p>
          </div>
        </div>
        <ChevronRight size={20} className="text-slate-600 group-hover:text-pink-500 transition-colors shrink-0 ml-4" />
      </button>

      <RoleUpgradeDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}
