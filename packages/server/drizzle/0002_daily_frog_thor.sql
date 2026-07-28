ALTER TABLE "activity_thread_states" RENAME TO "activity_comment_states";--> statement-breakpoint
ALTER TABLE "activity_comment_states" DROP CONSTRAINT "activity_thread_states_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "activity_comment_states" DROP CONSTRAINT "activity_thread_states_org_id_activity_id_activities_org_id_id_fk";
--> statement-breakpoint
DROP INDEX "comments_thread_idx";--> statement-breakpoint
ALTER TABLE "activity_comment_states" DROP CONSTRAINT "activity_thread_states_org_id_activity_id_pk";--> statement-breakpoint
ALTER TABLE "activity_comment_states" ADD CONSTRAINT "activity_comment_states_org_id_activity_id_pk" PRIMARY KEY("org_id","activity_id");--> statement-breakpoint
ALTER TABLE "activity_comment_states" ADD CONSTRAINT "activity_comment_states_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_comment_states" ADD CONSTRAINT "activity_comment_states_org_id_activity_id_activities_org_id_id_fk" FOREIGN KEY ("org_id","activity_id") REFERENCES "public"."activities"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_activity_idx" ON "comments" USING btree ("org_id","activity_id","status","created_at");