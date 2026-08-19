CREATE TABLE "wave_members" (
	"org_id" text NOT NULL,
	"wave_id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wave_members_wave_id_org_user_id_pk" PRIMARY KEY("wave_id","org_user_id")
);
--> statement-breakpoint
CREATE TABLE "waves" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"course_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waves_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rut" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "wave_members" ADD CONSTRAINT "wave_members_org_id_wave_id_waves_org_id_id_fk" FOREIGN KEY ("org_id","wave_id") REFERENCES "public"."waves"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wave_members" ADD CONSTRAINT "wave_members_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waves" ADD CONSTRAINT "waves_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waves" ADD CONSTRAINT "waves_org_id_course_id_courses_org_id_id_fk" FOREIGN KEY ("org_id","course_id") REFERENCES "public"."courses"("org_id","id") ON DELETE cascade ON UPDATE no action;