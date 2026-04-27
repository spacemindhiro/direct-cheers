create table wallet_device_registrations (
  id uuid primary key default gen_random_uuid(),
  device_library_identifier text not null,
  push_token text not null,
  serial_number text not null,
  pass_type_identifier text not null,
  created_at timestamptz default now(),
  unique(device_library_identifier, serial_number)
);
