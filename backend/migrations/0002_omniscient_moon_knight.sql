CREATE TABLE "media_playbacks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"milliseconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_runs" ADD COLUMN "departure_phase" text;--> statement-breakpoint
ALTER TABLE "media_playbacks" ADD CONSTRAINT "media_playbacks_run_id_game_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."game_runs"("id") ON DELETE cascade ON UPDATE no action;