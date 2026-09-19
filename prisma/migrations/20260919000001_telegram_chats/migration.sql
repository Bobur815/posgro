-- Telegram chats that have authenticated with the bot.
--
-- Purely additive — a new table, nothing existing is touched, nothing to backfill. Before this the
-- bot kept sessions in memory, so users were logged out on every deploy; that is survivable for a
-- menu but not for a notification channel that has to know which chat owns which store.
CREATE TABLE "telegram_chats" (
    -- BIGINT: Telegram chat ids have already passed 2^31.
    "chat_id"     BIGINT NOT NULL,
    "role"        TEXT NOT NULL,
    "user_id"     TEXT,
    "supplier_id" TEXT,
    "store_id"    TEXT,
    "phone"       TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "lang"        TEXT NOT NULL DEFAULT 'ru',
    -- Receive terminal log alerts.
    "alerts"      BOOLEAN NOT NULL DEFAULT true,
    -- Include the [fiscal-timing] telemetry that is filtered out by default. Not named "verbose":
    -- PostgreSQL refuses a bare VERBOSE as a column name, so every hand-written query would need
    -- to quote it.
    "verbose_alerts" BOOLEAN NOT NULL DEFAULT false,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_chats_pkey" PRIMARY KEY ("chat_id")
);

-- No foreign key to stores on purpose: this table caches an identity the bot re-derives from the
-- phone number on every login, and a store must stay deletable regardless of who opened the bot.
CREATE INDEX "telegram_chats_store_id_role_idx" ON "telegram_chats"("store_id", "role");
