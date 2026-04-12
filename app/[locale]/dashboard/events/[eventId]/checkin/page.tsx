import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const CheckinClient = dynamic(
  () => import("@/components/checkin-client").then((m) => ({ default: m.CheckinClient })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 size={28} className="text-indigo-400 animate-spin" />
      </div>
    ),
  }
);

export default function CheckinPage() {
  return <CheckinClient />;
}
