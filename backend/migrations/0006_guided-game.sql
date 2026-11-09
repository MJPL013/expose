ALTER TABLE "rooms" ADD COLUMN "question_history" jsonb NOT NULL DEFAULT '[]'::jsonb;
