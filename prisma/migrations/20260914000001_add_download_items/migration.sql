-- Files offered on panel.posgro.uz: printer drivers, scale utilities, manuals.
--
-- Purely additive — a new table, no change to any existing one — so this is safe to run against a
-- live database and there is nothing to backfill.
--
-- The POSGRO installer is deliberately NOT a row here. It is served from /releases/latest.yml,
-- which electron-builder writes and every terminal's updater already reads; a second source for
-- the same installer is how a shop downloads a build the updater will not accept.
CREATE TABLE "download_items" (
    "id"         TEXT NOT NULL,
    "slug"       TEXT NOT NULL,
    "titleRu"    TEXT NOT NULL,
    "titleUz"    TEXT NOT NULL,
    "descRu"     TEXT,
    "descUz"     TEXT,
    "category"   TEXT NOT NULL,
    "file_name"  TEXT NOT NULL,
    -- Relative, e.g. /downloads/xprinter-v3.2.zip. A stored host is what turns the next domain
    -- move into a database migration.
    "file_path"  TEXT NOT NULL,
    "file_size"  INTEGER NOT NULL,
    "mime_type"  TEXT NOT NULL,
    "version"    TEXT,
    "icon_url"   TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "published"  BOOLEAN NOT NULL DEFAULT true,
    "downloads"  INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "download_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "download_items_slug_key" ON "download_items"("slug");

-- The portal's only query: published files, grouped by category, in display order.
CREATE INDEX "download_items_published_category_sort_order_idx"
    ON "download_items"("published", "category", "sort_order");
