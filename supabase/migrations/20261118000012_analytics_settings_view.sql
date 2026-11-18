-- The analytics worker could not read analytics.settings (issue #51): the view called
-- private.config_on(), and a function inside a view runs with the caller's right to call it, which
-- pinkilock_analytics does not have. A table inside a view is read with the owner's rights, so the
-- view now reads private.config itself, with the same meaning (off unless set to 'true').
-- config_on stays closed to every role but its owner.
create or replace view analytics.settings as
  select coalesce((select value = 'true' from private.config where key = 'require_linked'), false) as require_linked;
grant select on analytics.settings to pinkilock_analytics;
