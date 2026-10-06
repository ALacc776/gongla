-- handle_new_user is a SECURITY DEFINER trigger function in an exposed schema.
-- Only the trigger on auth.users should run it, never API callers.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
