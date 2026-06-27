-- ============================================================
-- qr_configs.recipient_name_context: 宛先の「名義」を明示的に記録する
--
-- 背景: recipient_profile_id は「誰に払うか」しか分からない。
-- オーガナイザーが自分自身を演者として登録するケース（兼任）では、
-- 同一 profile_id がオーガナイザー名義・アーティスト名義の両方の
-- 選択肢として宛先選択UIに現れるため、profile_id だけでは
-- 「どちらの名義で作ったQRか」を区別できなかった。
-- このカラムでQR作成時に選んだ名義を確定的に保存する。
-- ============================================================

ALTER TABLE public.qr_configs
  ADD COLUMN IF NOT EXISTS recipient_name_context text NOT NULL DEFAULT 'artist'
    CHECK (recipient_name_context IN ('organizer', 'artist'));

-- 既存データの推測バックフィル: recipient_profile_id がイベントの
-- organizer_profile_id と一致するなら 'organizer'、それ以外は 'artist'。
-- （過去レコードの真の意図は分からないため、最も妥当な近似値を入れる）
UPDATE public.qr_configs qc
SET recipient_name_context = 'organizer'
FROM public.events e
WHERE qc.event_id = e.event_id
  AND qc.recipient_profile_id = e.organizer_profile_id;

COMMENT ON COLUMN public.qr_configs.recipient_name_context IS
  'QR作成時に選択した宛先の名義コンテキスト。organizer=主催者名義、artist=演者名義。recipient_profile_idだけでは兼任ケースを区別できないため必須。';
