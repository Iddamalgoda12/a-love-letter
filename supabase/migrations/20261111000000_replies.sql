create table public.replies (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) between 1 and 2000),
  created_at timestamptz not null default now(),
  read boolean not null default false
);
-- Add the intended Auth user ID manually after creating the administrator.
create table public.reply_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.replies enable row level security;
alter table public.reply_admins enable row level security;
revoke all on public.replies from anon, authenticated;
grant select, update, delete on public.replies to authenticated;
grant select on public.reply_admins to authenticated;
create policy "Admins see their own allowlist entry" on public.reply_admins for select to authenticated using (user_id = auth.uid());
create policy "Admins read replies" on public.replies for select to authenticated using (exists (select 1 from public.reply_admins where user_id = auth.uid()));
create policy "Admins update replies" on public.replies for update to authenticated using (exists (select 1 from public.reply_admins where user_id = auth.uid())) with check (exists (select 1 from public.reply_admins where user_id = auth.uid()));
create policy "Admins delete replies" on public.replies for delete to authenticated using (exists (select 1 from public.reply_admins where user_id = auth.uid()));
-- Atomic, database-backed per-address rate limit. Only the service role can invoke it.
create table public.reply_rate_limits (key text primary key, window_start timestamptz not null, attempts integer not null);
alter table public.reply_rate_limits enable row level security;
revoke all on public.reply_rate_limits from anon, authenticated;
create function public.submit_limited_reply(p_key text, p_message text) returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
 if p_key is null or length(p_key) <> 64 or p_message is null or char_length(trim(p_message)) not between 1 and 2000 then return false; end if;
 insert into public.reply_rate_limits as limits (key, window_start, attempts) values (p_key, now(), 1)
 on conflict (key) do update set window_start = case when limits.window_start < now() - interval '1 hour' then now() else limits.window_start end,
 attempts = case when limits.window_start < now() - interval '1 hour' then 1 else limits.attempts + 1 end returning attempts into n;
 if n > 5 then return false; end if;
 insert into public.replies(message) values (trim(p_message));
 return true;
end $$;
revoke all on function public.submit_limited_reply(text,text) from public, anon, authenticated;
grant execute on function public.submit_limited_reply(text,text) to service_role;
