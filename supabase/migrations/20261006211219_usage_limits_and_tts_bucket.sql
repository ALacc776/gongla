-- Milestones 4 and 5: daily usage counter (F12) and the TTS audio cache bucket (F10).

-- Atomically adds p_amount to one usage_daily counter for today (UTC). Returns
-- false, and changes nothing, if that would take the counter above p_limit.
-- Pass p_limit null to count without a limit (or to refund with a negative amount).
create function public.bump_usage(p_user uuid, p_field text, p_amount int, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_new int;
begin
  if p_field not in ('messages', 'side_questions', 'tts_chars') then
    raise exception 'unknown usage field %', p_field;
  end if;

  insert into public.usage_daily (user_id, day) values (p_user, v_day)
  on conflict (user_id, day) do nothing;

  execute format(
    'update public.usage_daily set %1$I = greatest(%1$I + $1, 0)
     where user_id = $2 and day = $3 and ($4 is null or %1$I + $1 <= $4)
     returning %1$I',
    p_field)
  using p_amount, p_user, v_day, p_limit
  into v_new;

  return v_new is not null;
end;
$$;

-- Only Edge Functions (service role) may call it.
revoke execute on function public.bump_usage(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.bump_usage(uuid, text, int, int) to service_role;

-- Private bucket for synthesized speech. Only the service role writes or signs URLs.
insert into storage.buckets (id, name, public)
values ('tts', 'tts', false)
on conflict (id) do nothing;
