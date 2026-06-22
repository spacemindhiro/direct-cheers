import type Stripe from "stripe";
import { checkConnectCapabilities } from "./stripe-check";
import { buildStatementDescriptorSuffixes } from "./statement-descriptor";

export type EntrancePaymentParams = {
  /** Stripe PaymentIntent/Checkout Session の payment_intent_data に渡す on_behalf_of */
  onBehalfOf?: string;
  /** payment_intent_data.statement_descriptor_suffix（ASCII・常にイベント名ベース） */
  statementDescriptorSuffix?: string;
  /** payment_method_options.card.statement_descriptor_suffix_kana */
  statementDescriptorSuffixKana?: string;
  /** payment_method_options.card.statement_descriptor_suffix_kanji */
  statementDescriptorSuffixKanji?: string;
};

export class EntranceAccountIncompleteError extends Error {
  missingCapabilities: string[];
  constructor(missing: string[]) {
    super(`オーガナイザーのStripeアカウント設定が未完了です（不足: ${missing.join(", ")}）`);
    this.name = "EntranceAccountIncompleteError";
    this.missingCapabilities = missing;
  }
}

/**
 * 入場券決済（タイプA/B/C共通）で使う on_behalf_of・statement_descriptor_suffix を組み立てる。
 * チア決済（pay/cheers/route.ts）と同様、MoR をオーガナイザーに移すため on_behalf_of を設定する。
 *
 * pay/cheers/route.ts と同じ挙動にする:
 * - Connectアカウントを未だ発行していない（stripe_connect_id が null）→ on_behalf_of を
 *   静かに省略するだけで決済自体はブロックしない（オーソリ最大化の原則。チケット販売を
 *   止めない。資金はsettle時にpending_connect_transfersでプールされ後で回収される）。
 * - Connectアカウントは発行済みだが capability が未完了（オンボーディング中断）→
 *   EntranceAccountIncompleteError を投げてブロックする（チア決済のaccount_incompleteと同じ）。
 *
 * 入場券の宛先名義は常にイベント名（recipient_name_context は見ない）。
 */
export async function buildEntrancePaymentParams(
  admin: any,
  stripe: Stripe,
  eventId: string,
): Promise<EntrancePaymentParams> {
  const { data: event } = await admin
    .from("events")
    .select("title, organizer_profile_id")
    .eq("event_id", eventId)
    .single();

  const { suffix: statementDescriptorSuffix, suffixKana: statementDescriptorSuffixKana, suffixKanji: statementDescriptorSuffixKanji } =
    buildStatementDescriptorSuffixes({
      isEntrance: true,
      eventTitle: event?.title,
      recipientNameContext: "organizer",
    });

  if (!event?.organizer_profile_id) {
    return { statementDescriptorSuffix, statementDescriptorSuffixKana, statementDescriptorSuffixKanji };
  }

  const { data: orgProfile } = await admin
    .from("profiles")
    .select("stripe_connect_id")
    .eq("profile_id", event.organizer_profile_id)
    .single();

  const connectId = orgProfile?.stripe_connect_id ?? null;
  if (!connectId) {
    // 未発行 = オンボーディング未着手。チア決済と同様にブロックせず on_behalf_of なしで進める。
    return { statementDescriptorSuffix, statementDescriptorSuffixKana, statementDescriptorSuffixKanji };
  }

  const { ok, missing } = await checkConnectCapabilities(stripe, connectId);
  if (!ok) {
    // 発行済みだが capability 未完了 = オンボーディング中断。ここはチア決済同様にブロックする。
    throw new EntranceAccountIncompleteError(missing);
  }

  return {
    onBehalfOf: connectId,
    statementDescriptorSuffix,
    statementDescriptorSuffixKana,
    statementDescriptorSuffixKanji,
  };
}
