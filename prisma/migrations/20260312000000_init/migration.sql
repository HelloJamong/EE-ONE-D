-- Baseline migration for installations that previously used `prisma db push`.
-- Every statement is safe to apply when the current tables already exist.

DO $$
BEGIN
    CREATE TYPE "PanelMode" AS ENUM ('MULTI', 'SINGLE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "ActivityType" AS ENUM ('PLAYING', 'WATCHING', 'LISTENING');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "guild_settings" (
    "guild_id" TEXT NOT NULL,
    "role_panel_channel_id" TEXT,
    "admin_config_channel_id" TEXT,
    "log_channel_id" TEXT,
    "notification_channel_id" TEXT,
    "welcome_channel_id" TEXT,
    "audit_enabled" BOOLEAN NOT NULL DEFAULT false,
    "activity_type" "ActivityType",
    "activity_text" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guild_settings_pkey" PRIMARY KEY ("guild_id")
);

CREATE TABLE IF NOT EXISTS "role_panels" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "mode" "PanelMode" NOT NULL,
    "allow_none" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "published_channel_id" TEXT,
    "published_message_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "role_panels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "role_panel_items" (
    "id" TEXT NOT NULL,
    "panel_id" TEXT NOT NULL,
    "emoji_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "role_panel_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "audit_events" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "channel_id" TEXT,
    "target_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB NOT NULL,
    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "custom_commands" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" VARCHAR(100),
    "response" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "custom_commands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "welcome_message" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "message_id" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "button_emoji" TEXT,
    "button_label" TEXT NOT NULL,
    "role_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "welcome_message_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "role_panel_items_panel_id_emoji_id_key" ON "role_panel_items"("panel_id", "emoji_id");
CREATE UNIQUE INDEX IF NOT EXISTS "role_panel_items_panel_id_role_id_key" ON "role_panel_items"("panel_id", "role_id");
CREATE INDEX IF NOT EXISTS "custom_commands_guild_id_idx" ON "custom_commands"("guild_id");
CREATE UNIQUE INDEX IF NOT EXISTS "custom_commands_guild_id_name_key" ON "custom_commands"("guild_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "welcome_message_guild_id_key" ON "welcome_message"("guild_id");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_panels_guild_id_fkey' AND conrelid = '"role_panels"'::regclass) THEN
        ALTER TABLE "role_panels" ADD CONSTRAINT "role_panels_guild_id_fkey"
            FOREIGN KEY ("guild_id") REFERENCES "guild_settings"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_panel_items_panel_id_fkey' AND conrelid = '"role_panel_items"'::regclass) THEN
        ALTER TABLE "role_panel_items" ADD CONSTRAINT "role_panel_items_panel_id_fkey"
            FOREIGN KEY ("panel_id") REFERENCES "role_panels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_events_guild_id_fkey' AND conrelid = '"audit_events"'::regclass) THEN
        ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_guild_id_fkey"
            FOREIGN KEY ("guild_id") REFERENCES "guild_settings"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'custom_commands_guild_id_fkey' AND conrelid = '"custom_commands"'::regclass) THEN
        ALTER TABLE "custom_commands" ADD CONSTRAINT "custom_commands_guild_id_fkey"
            FOREIGN KEY ("guild_id") REFERENCES "guild_settings"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'welcome_message_guild_id_fkey' AND conrelid = '"welcome_message"'::regclass) THEN
        ALTER TABLE "welcome_message" ADD CONSTRAINT "welcome_message_guild_id_fkey"
            FOREIGN KEY ("guild_id") REFERENCES "guild_settings"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
