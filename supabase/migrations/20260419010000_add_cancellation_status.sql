-- lifecycle_status に中止申請・中止済みを追加
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_lifecycle_status_check;
ALTER TABLE events ADD CONSTRAINT events_lifecycle_status_check
  CHECK (lifecycle_status = ANY (ARRAY[
    'draft', 'published', 'ongoing', 'ended', 'settled',
    'cancellation_requested', 'cancelled'
  ]));
