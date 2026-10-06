-- Milestone 2: replies that still scored as Mandarin after one regeneration (F4),
-- for the weekly native-speaker review. Read it from the dashboard (service role).
create view flagged_replies
with (security_invoker = true) as
select
  m.id,
  m.session_id,
  m.text_raw,
  m.payload->>'english' as english,
  m.payload->'mandarin_hits' as mandarin_hits,
  m.created_at
from messages m
where m.role = 'assistant'
  and (m.payload->>'mandarin_flagged')::boolean is true;

revoke all on flagged_replies from anon, authenticated;
