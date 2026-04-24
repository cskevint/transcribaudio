create table if not exists public.records (
  id bigint generated always as identity primary key,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists records_created_at_idx
  on public.records (created_at desc);