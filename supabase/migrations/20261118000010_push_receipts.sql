-- Push receipts (docs/build-plan.md, WP0b). Expo's first answer (a ticket) only says it accepted a
-- push; whether Apple or Google then delivered it comes later, as a receipt. The push function now
-- keeps each ticket and, on a later run, asks for its receipt: a device that turned out to be gone
-- loses its token, and any other failure is written on the notification.
--
-- Read and written by the push function alone (service role). No client role holds any right on
-- it; a ticket goes with its notification, and so with the account.
create table public.push_tickets (
  id text primary key,
  notification_id bigint not null references public.notifications (id) on delete cascade,
  token text not null,
  sent_at timestamptz not null default now()
);
create index push_tickets_sent_idx on public.push_tickets (sent_at);
alter table public.push_tickets enable row level security;
revoke all on public.push_tickets from public, anon, authenticated;

-- What the receipt said, when it was not "ok". Ids and Expo's error name only.
alter table public.notifications add column receipt_error text;

-- The sweep wakes the push function only when something waits to be sent. Receipts must be read
-- within the day Expo keeps them, quiet or not: every 15 minutes, wake it when any are due.
select cron.schedule('pinkilock-push-receipts', '*/15 * * * *',
  $$select public.kick_push() where exists (select 1 from public.push_tickets where sent_at < now() - interval '15 minutes')$$);
