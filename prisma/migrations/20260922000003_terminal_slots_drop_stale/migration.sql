-- Follow-up to 20260922000001_terminal_slots: its backfill took every heartbeat ever sent, so a
-- till retired months ago could hold a store's only slot ahead of the till actually in use (staging
-- store 1000: T3, last heard of 2026-04-30, outranked T1). Slots go to the earliest-registered, so
-- a dead till must not be registered at all.
--
-- Drops rows not seen in the last 90 days — the same window the backfill used for sales. Runs once:
-- on a server applying both migrations together this is simply the backfill done right; a till
-- that comes back later registers again, as the newest.
DELETE FROM "store_terminals" WHERE "last_seen_at" < NOW() - INTERVAL '90 days';
