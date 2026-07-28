CREATE TABLE "activity_thread_states" (
	"org_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"state" text NOT NULL,
	CONSTRAINT "activity_thread_states_org_id_activity_id_pk" PRIMARY KEY("org_id","activity_id")
);
--> statement-breakpoint
CREATE TABLE "comment_reactions" (
	"org_id" text NOT NULL,
	"comment_id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_reactions_org_id_comment_id_org_user_id_emoji_pk" PRIMARY KEY("org_id","comment_id","org_user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "comment_reports" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"comment_id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_reports_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "comment_reports_org_id_comment_id_org_user_id_unique" UNIQUE("org_id","comment_id","org_user_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"activity_id" text NOT NULL,
	"parent_id" text,
	"org_user_id" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"removed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "comments_removed_by_check" CHECK (("comments"."status" = 'removed') = ("comments"."removed_by" is not null))
);
--> statement-breakpoint
CREATE TABLE "discussion_settings" (
	"org_id" text NOT NULL,
	"course_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"threaded" boolean DEFAULT true NOT NULL,
	"require_review" boolean DEFAULT false NOT NULL,
	"reactions" boolean DEFAULT true NOT NULL,
	CONSTRAINT "discussion_settings_org_id_course_id_pk" PRIMARY KEY("org_id","course_id")
);
--> statement-breakpoint
ALTER TABLE "activity_thread_states" ADD CONSTRAINT "activity_thread_states_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_thread_states" ADD CONSTRAINT "activity_thread_states_org_id_activity_id_activities_org_id_id_fk" FOREIGN KEY ("org_id","activity_id") REFERENCES "public"."activities"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_org_id_comment_id_comments_org_id_id_fk" FOREIGN KEY ("org_id","comment_id") REFERENCES "public"."comments"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_org_id_comment_id_comments_org_id_id_fk" FOREIGN KEY ("org_id","comment_id") REFERENCES "public"."comments"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_org_id_activity_id_activities_org_id_id_fk" FOREIGN KEY ("org_id","activity_id") REFERENCES "public"."activities"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_org_id_removed_by_org_users_org_id_id_fk" FOREIGN KEY ("org_id","removed_by") REFERENCES "public"."org_users"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_org_id_parent_id_comments_org_id_id_fk" FOREIGN KEY ("org_id","parent_id") REFERENCES "public"."comments"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_settings" ADD CONSTRAINT "discussion_settings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_settings" ADD CONSTRAINT "discussion_settings_org_id_course_id_courses_org_id_id_fk" FOREIGN KEY ("org_id","course_id") REFERENCES "public"."courses"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_reports_open_idx" ON "comment_reports" USING btree ("org_id","comment_id","resolved_at");--> statement-breakpoint
CREATE INDEX "comments_thread_idx" ON "comments" USING btree ("org_id","activity_id","status","created_at");--> statement-breakpoint
CREATE INDEX "comments_queue_idx" ON "comments" USING btree ("org_id","status","created_at");