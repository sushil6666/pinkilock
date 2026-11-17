-- A new end state for an invite: `ended`. A block (and an account deletion) closes every live
-- invite between the two people at once, and that is nobody's flake: not a decline, not a bail,
-- not a no-show, so it gets its own status and counts for no one's Trust Score.
--
-- Its own migration because Postgres cannot use a new enum value in the transaction that adds
-- it; the functions that set it are in the next file.
alter type public.invite_status add value if not exists 'ended';
