-- events.lifecycle_status に review_requested を追加
-- オーガナイザーが承認依頼を送った状態（draft → review_requested → published）
alter table public.events
  drop constraint if exists events_lifecycle_status_check;

alter table public.events
  add constraint events_lifecycle_status_check
    check (lifecycle_status in (
      'draft', 'review_requested', 'published', 'ongoing',
      'ended', 'settled', 'cancellation_requested', 'cancelled'
    ));
