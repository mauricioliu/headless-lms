CREATE TABLE "evaluation_attempts" (
	"org_id" text NOT NULL,
	"course_id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"answers" jsonb,
	"score" integer,
	"cutoff" integer,
	"passed" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_attempts_org_id_course_id_org_user_id_attempt_number_pk" PRIMARY KEY("org_id","course_id","org_user_id","attempt_number"),
	CONSTRAINT "evaluation_attempts_score_range" CHECK ("evaluation_attempts"."score" is null or "evaluation_attempts"."score" between 0 and 100),
	CONSTRAINT "evaluation_attempts_cutoff_range" CHECK ("evaluation_attempts"."cutoff" is null or "evaluation_attempts"."cutoff" between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "evaluation_attempts" ADD CONSTRAINT "evaluation_attempts_org_id_course_id_courses_org_id_id_fk" FOREIGN KEY ("org_id","course_id") REFERENCES "public"."courses"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_attempts" ADD CONSTRAINT "evaluation_attempts_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;