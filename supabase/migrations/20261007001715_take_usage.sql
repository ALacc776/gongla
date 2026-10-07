-- Speed: count one message or tutor question against today's limit for the
-- user's plan in a single round trip (F12). Returns false if over the limit.
create function public.take_usage(p_user uuid, p_field text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_limit int;
begin
  select plan into v_plan from public.profiles where id = p_user;
  v_limit := case
    when p_field = 'messages' then case when v_plan = 'pro' then 300 else 25 end
    when p_field = 'side_questions' then case when v_plan = 'pro' then 100 else 10 end
  end;
  if v_limit is null then
    raise exception 'unknown usage field %', p_field;
  end if;
  return public.bump_usage(p_user, p_field, 1, v_limit);
end;
$$;

revoke execute on function public.take_usage(uuid, text) from public, anon, authenticated;
grant execute on function public.take_usage(uuid, text) to service_role;
