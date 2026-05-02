/**
 * サーバーサイドから Supabase Realtime チャンネルへ broadcast する。
 * WebSocket 不要の REST API を使う。fire-and-forget 想定。
 */
export async function broadcastCheerNew(eventId: string, amount: number): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return;

    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey":        serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        messages: [{
          topic:   `realtime:event-display:${eventId}`,
          event:   "cheer-new",
          payload: { amount },
        }],
      }),
    });
  } catch { /* サイレント */ }
}
