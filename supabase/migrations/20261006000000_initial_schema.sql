-- Milestone 0: schema from docs/design.md section 4, with Row Level Security.
-- The app (anon/authenticated roles) can read its own rows. Writes happen in Edge
-- Functions with the service role key, except profile settings (see grants below).

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  level smallint not null default 1,          -- 1 (absolute beginner) to 5
  display_prefs jsonb not null default
    '{"hanzi": true, "jyutping": true, "english": true, "tone_colors": false}',
  voice text not null default 'zh-HK-HiuMaanNeural',
  speech_rate real not null default 0.85,     -- slower by default for learners
  plan text not null default 'free',          -- 'free' | 'pro'
  memory jsonb not null default '{"facts": []}', -- learner memory note, see F17
  memory_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table scenarios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users on delete cascade, -- null = built-in
  pack text,                                  -- 'everyday', 'food', 'travel', 'family', 'work'
  spec jsonb not null,                        -- see section 5.7
  is_custom boolean not null default false,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  scenario_id uuid not null references scenarios,
  target_gap_ids uuid[] not null default '{}', -- gaps injected into this session
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  turn_count int not null default 0,
  cantonese_ratio real,                        -- see F9
  summary jsonb,
  last_message_preview text                    -- for the chat history list, see F18
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  text_raw text not null,                     -- what the user typed, or the hanzi reply
  payload jsonb,                              -- full structured reply for assistant messages
  created_at timestamptz not null default now()
);

create table gaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  english text not null,                      -- normalized lemma, lowercase ("receipt")
  hanzi text not null,                        -- "單"
  jyutping text not null,                     -- "daan1"
  kind text not null check (kind in ('production', 'recognition')),
  status text not null default 'new'
    check (status in ('new', 'practicing', 'closed')),
  times_stuck int not null default 1,
  times_used int not null default 0,
  interval_days real not null default 0,
  next_due_at timestamptz not null default now(),
  first_used_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, hanzi, kind)
);

create table gap_events (
  id uuid primary key default gen_random_uuid(),
  gap_id uuid not null references gaps on delete cascade,
  session_id uuid references sessions on delete set null,
  message_id uuid references messages on delete set null,
  kind text not null check (kind in ('fallback', 'asked', 'corrected', 'tapped', 'used')),
  created_at timestamptz not null default now()
);

create table side_questions (                 -- Ask panel, see F16
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions on delete cascade,
  question text not null,
  answer jsonb not null,                      -- { text, examples: [{hanzi, english}] }
  created_gap_id uuid references gaps on delete set null,
  created_at timestamptz not null default now()
);

create table usage_daily (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  messages int not null default 0,
  side_questions int not null default 0,
  tts_chars int not null default 0,
  primary key (user_id, day)
);

create table tts_cache (
  hash text primary key,                      -- sha256(voice + rate + text)
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- Indexes on columns the RLS policies and history screens filter by.
create index scenarios_owner_id_idx on scenarios (owner_id);
create index sessions_user_id_idx on sessions (user_id, started_at desc);
create index messages_session_id_idx on messages (session_id, created_at);
create index gaps_user_due_idx on gaps (user_id, status, next_due_at);
create index gap_events_gap_id_idx on gap_events (gap_id);
create index side_questions_session_id_idx on side_questions (session_id, created_at);

-- Every user gets a profile row on sign-up (including anonymous sign-in).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security on every table.
alter table profiles enable row level security;
alter table scenarios enable row level security;
alter table sessions enable row level security;
alter table messages enable row level security;
alter table gaps enable row level security;
alter table gap_events enable row level security;
alter table side_questions enable row level security;
alter table usage_daily enable row level security;
alter table tts_cache enable row level security;  -- no policies: service role only

create policy "profiles: read own" on profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "profiles: update own" on profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "scenarios: read built-in and own" on scenarios
  for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));

create policy "sessions: read own" on sessions
  for select to authenticated using (user_id = (select auth.uid()));

create policy "messages: read own" on messages
  for select to authenticated
  using (exists (
    select 1 from sessions s
    where s.id = messages.session_id and s.user_id = (select auth.uid())
  ));

create policy "gaps: read own" on gaps
  for select to authenticated using (user_id = (select auth.uid()));

create policy "gap_events: read own" on gap_events
  for select to authenticated
  using (exists (
    select 1 from gaps g
    where g.id = gap_events.gap_id and g.user_id = (select auth.uid())
  ));

create policy "side_questions: read own" on side_questions
  for select to authenticated
  using (exists (
    select 1 from sessions s
    where s.id = side_questions.session_id and s.user_id = (select auth.uid())
  ));

create policy "usage_daily: read own" on usage_daily
  for select to authenticated using (user_id = (select auth.uid()));

-- Table privileges: the app can only read, except a few profile settings.
-- Everything else is written by Edge Functions using the service role.
revoke all on all tables in schema public from anon, authenticated;
grant select on profiles, scenarios, sessions, messages, gaps, gap_events,
  side_questions, usage_daily to authenticated;
-- Not granted: plan (set by the server) so users can't upgrade themselves.
grant update (level, display_prefs, voice, speech_rate, memory, memory_updated_at)
  on profiles to authenticated;
