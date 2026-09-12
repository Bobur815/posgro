-- Store contact phones, the way the rest of the system stores a phone: 998XXXXXXXXX. They used to
-- be saved as typed ("+998 932144774"), so the same number showed two ways. Only rows that are
-- plainly an Uzbek number (9 digits, or 12 starting with 998) are rewritten; anything else is left
-- exactly as it is.
UPDATE "stores"
SET "phone" = '998' || right(regexp_replace("phone", '\D', '', 'g'), 9)
WHERE "phone" IS NOT NULL
  AND "phone" !~ '^998[0-9]{9}$'
  AND regexp_replace("phone", '\D', '', 'g') ~ '^(998)?[0-9]{9}$';
