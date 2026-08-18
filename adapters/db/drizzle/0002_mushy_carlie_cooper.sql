CREATE TABLE "evaluations" (
	"org_id" text NOT NULL,
	"course_id" text NOT NULL,
	"cutoff" integer DEFAULT 70 NOT NULL,
	"feedback_mode" text DEFAULT 'score_only' NOT NULL,
	"questions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluations_org_id_course_id_pk" PRIMARY KEY("org_id","course_id"),
	CONSTRAINT "evaluations_cutoff_range" CHECK ("evaluations"."cutoff" between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_org_id_course_id_courses_org_id_id_fk" FOREIGN KEY ("org_id","course_id") REFERENCES "public"."courses"("org_id","id") ON DELETE cascade ON UPDATE no action;