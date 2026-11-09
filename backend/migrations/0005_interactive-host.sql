ALTER TABLE "rooms" ADD COLUMN "host_memory" jsonb DEFAULT '[]'::jsonb NOT NULL;
