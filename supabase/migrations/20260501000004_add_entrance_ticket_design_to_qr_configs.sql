alter table public.qr_configs
  add column if not exists strip_image_url text,
  add column if not exists bg_color       text not null default '#0f172a',
  add column if not exists fg_color       text not null default '#ffffff',
  add column if not exists label_color    text not null default '#94a3b8';
