-- 海外発行カードのカード利用明細はASCII（半角英数字）のみ表示されるため、
-- artist_name/organizer_nameが漢字の場合、自動生成されるASCII版suffixが
-- 空になり「明細なし」になってしまう。手動でアルファベット表記を
-- 指定できるようにする（未設定ならartist_name/organizer_nameからの
-- 自動生成にフォールバックする）。

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS artist_name_ascii    text,
  ADD COLUMN IF NOT EXISTS organizer_name_ascii text;
