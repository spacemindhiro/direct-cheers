-- SpaceMind 2026 Hideaway Gathering (event_id: 3154c83f-5ffb-4eb5-86b7-7b032e32ed64)の
-- データ修正。20260727010000で修正したdistribution_role誤判定バグの実害を後始末する。
--
-- 事象:
-- 受取人 a7407a12-20fa-49e3-b201-416f438a89cd（profiles.role='agent'、かつ本イベントの
-- organizer_profile_id/agent_id 両方）について、qr_config_targets経由のorganizer取り分
-- （recipient_name_context='organizer'）が、旧ロジックによりprofiles.roleそのまま
-- distribution_role='agent'として記録されていた。さらにsettle実行時の既存行検索が
-- distribution_role IN ('artist','organizer')のみを対象にしていたため、この誤ラベル行を
-- 「既存」と認識できず、同額の行をもう1行INSERTしてしまい、43件の決済すべてで完全な
-- 重複（2行×同額）が発生していた。
--
-- ファクト確認（読み取り専用スクリプトで全131行を突合、不一致0件で完全に仕分け済み）:
--   - 真のエージェント手数料行: 45件・合計4,325円 → 対象外（変更なし）
--   - 重複したorganizer配分行: 43件×2=86件・合計147,076円
--     → 43件を残してdistribution_role を 'agent' → 'organizer' に修正
--     → 残り43件（重複分）を削除
--
-- 加えて、この壊れたデータから計算された pending_connect_transfers の保留Transfer
-- （73,538円、role='agent'）は正しい未払額を反映していないため、自動リトライ
--（毎日06:00 JSTのGitHub Actions cron）で誤送金されないよう無効化する。
-- 正しい未払残額（77,863円 - 既払67,138円 = 10,725円）の実際の支払いは、
-- 本マイグレーションの範囲外（別途Stripe Transferの実行が必要な操作のため）。

-- 1) 残す43行: distribution_role を organizer に修正
--    安全のため、対象profile・現在値'agent'であることも条件に含める。
UPDATE transaction_distributions
SET distribution_role = 'organizer'
WHERE transaction_distribution_id IN (
  '419dd349-fa67-48e4-8545-21f25adbc594',
  '3743b6d5-273b-40f4-b6a9-6254f0ced570',
  '0e627fc7-fc4b-4b39-88ea-42fa299d5295',
  '77b80000-84b5-4357-816e-f63a8057358b',
  '2ba4965c-af87-44b4-bffe-3912d380b7ee',
  '65f5518c-0500-4532-9348-66e6ebf0e403',
  'e153706d-0b67-40db-aa1e-cb0988ffa733',
  'ce53be24-e460-42d2-a79c-de4810a0bdb5',
  'cf71de82-0d18-4760-a653-fd071df2f016',
  'f36c4ec1-c24f-445d-936e-ead5eca32a3a',
  '7e5a521c-39e6-45bf-a049-e301b6e37625',
  'ad5f73e8-4383-4ea9-b526-7358109ddc80',
  '48b541ef-1bbe-4f38-8cee-900b7854629b',
  '6d22a311-92ad-4cc1-a32c-861016d1dba5',
  'c3012cd5-99b9-4c2d-a987-f7fc3595fe45',
  'e02cad6a-4204-4cc5-8358-d9f9a653bf49',
  '1e644867-0e76-4c68-9edb-a8d20cdda7d9',
  '9eeb3830-401d-471f-b7cb-914a35f9e381',
  '57877fce-e3c3-4e15-80a1-b7773583ea69',
  '0c48d3b7-1995-4b51-943d-377326b1cd19',
  'd924c60b-3151-4e61-8e69-364d984e7ec4',
  '27a3e643-ef12-4266-ad7b-f1503754e5ad',
  '4e38a783-01fa-410e-a80d-30a8c33d54bf',
  'f0b1a85e-584c-42cb-b772-f54f160cc6db',
  '06d42be1-17c0-4673-b481-3bcb60697bb8',
  'cd307485-9fa8-46e4-a776-67118bd585cb',
  '479a6b37-88e9-46d6-b2c6-d0d0c275c8e5',
  'e4dd53eb-269f-4275-b0cf-778f08c0de23',
  '1d64e4b1-f873-4082-ab8e-f486a9ec33f1',
  '295fc0aa-a2eb-4f37-9759-7bdcd1d970e1',
  'e880e2b5-eb89-4a9b-933d-fcf1918ef5eb',
  '678fcb5b-d2da-44ca-b09f-1a4e38362420',
  '0d9554bc-2f67-4c85-92b5-bb4cf63ccb30',
  'b4cb13c2-e0f0-4dc5-b945-dc86c1d2bc57',
  'f538e53f-5702-4e45-b360-22007eac5b77',
  '01139bcc-6526-4c1b-8642-fe3bdb0cea68',
  '45957156-1795-4c7b-97c8-fead239299da',
  'aa5f856a-be6e-4d6c-8d3d-f3861ca1f4d9',
  '1ece9188-3d0d-49fa-a024-b5a9a0a313f2',
  '98f0d148-fda9-4249-9119-3628d8a03b82',
  '7e582c39-ec70-470e-be59-3494cbc53a2c',
  '070a7115-9228-47f0-93d3-e75cd27943bc',
  '91c44aa2-a5f0-40ed-aca5-d04dffe3e2c5'
)
AND profile_id = 'a7407a12-20fa-49e3-b201-416f438a89cd'
AND distribution_role = 'agent';

-- 2) 重複した43行を削除
DELETE FROM transaction_distributions
WHERE transaction_distribution_id IN (
  '3d98ba33-44cb-45a4-a211-04ad1600f0b1',
  '472c00fb-8857-4566-9b76-eac369f8e740',
  '62b4d415-6e01-4336-97a0-c2fc6615ec1c',
  'dbee2074-0e21-4912-86fa-270823e5161c',
  'ca583ca6-6d05-4b0f-b63c-35e6e415ec75',
  '47255d17-e841-4d61-89e9-65db71bbadc5',
  'a4dc35db-5375-4955-a2ff-b485bb14aec0',
  '4ee00955-7ce3-45bc-8f7d-3a5577747233',
  'a2c20c7d-be54-46ec-9694-e4787c9e65a3',
  'fccdb921-db76-42b8-a0c2-d848bd9da4d8',
  '96109c3c-5dba-4e68-afd3-c647b2e6fdd1',
  'cfe93eaa-4ba4-4908-b0d1-49a87f4b1872',
  'fe360ecf-65a8-45e6-92ac-bd25cdd3d534',
  '864e71b8-e74e-493c-80be-44e8eca93f2a',
  '50c8c35a-976a-4f4d-aef3-33bb30dad5ff',
  '86453b38-b242-42b0-abee-f700b90aec7e',
  '5a461542-3607-4fe5-9c1b-87de808e3065',
  '4bad9281-c792-41c9-acb1-2081484a2c21',
  '852dcef4-ba7a-4796-aaef-c09461fb5a89',
  'b9a7ea1b-cc10-4c3a-97b4-7618fa8968a9',
  '9bd9a784-d395-483e-89e8-a8a689ad84c5',
  '24b45e53-981e-4b7e-a203-1fb65c711a6f',
  '39c271d2-8669-4bb8-aedf-493d665fbcf2',
  'f9483363-2493-4573-9369-b7ad1e27e619',
  '20f46194-5e17-4273-aed1-18b5d8b34c17',
  '8b67767c-2277-46b4-81e9-52be3c68a11a',
  'a89f00b8-92b7-4694-97ee-b77bd039e593',
  '6a378223-776a-435b-8e86-21e21b908ce4',
  '8c776c36-fb2d-4821-a6ba-4de6f3eb0526',
  '8e8fc9a3-a0b9-49fe-8fb1-b7329807edba',
  '61c89754-1d31-4f17-88cc-21cedad3bbc1',
  'b7a234a1-0d22-4e25-92d7-e9a96a6b9d8c',
  '74bcb21e-2ca8-4b05-820f-55b5290e1a32',
  '18ee0457-4362-40c2-9fbb-d1513551e1a5',
  '109895ec-e803-43d0-999c-e2bae8bbc0cb',
  '549885dd-f6b8-4cce-bc60-899f8f31c5ff',
  'b68a6f12-d871-4720-bd9f-0af23c42b008',
  'e0130bde-170e-4e3b-9547-fd3b0ce231eb',
  '16395f34-32b7-436d-b0a9-3d40b7dd19ae',
  '44bef069-9ee0-42f1-bce9-bba08c407b25',
  'b99383bb-7123-4426-a525-b5bd0b0cd6a7',
  'f85b0726-f67a-4241-ab04-cf037c677a10',
  '6857f646-c6a9-4fdc-9f6e-85fe8bd7f90c'
)
AND profile_id = 'a7407a12-20fa-49e3-b201-416f438a89cd'
AND distribution_role = 'agent';

-- 3) 壊れたデータから計算された保留Transferを無効化（自動リトライで誤送金させない）
UPDATE pending_connect_transfers
SET
  status = 'failed',
  last_error = 'distribution_role誤判定によるデータ不整合(qr_config_targets由来の配分がagentと誤記録され二重計上)のため無効化。手動調査により正しい未払額を別途精算予定。2026-07-27対応。',
  resolved_at = now()
WHERE event_id = '3154c83f-5ffb-4eb5-86b7-7b032e32ed64'
  AND status = 'pending';
