CREATE TABLE "invitations" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"invited_by" text NOT NULL,
	"token_hash" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "org_users" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"user_id" text,
	"role" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_users_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "org_users_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "org_users_org_id_email_unique" UNIQUE("org_id","email"),
	CONSTRAINT "org_users_org_id_user_id_unique" UNIQUE("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"module_id" text NOT NULL,
	"course_id" text NOT NULL,
	"seq" integer NOT NULL,
	"settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "activities_org_id_module_id_seq_unique" UNIQUE("org_id","module_id","seq")
);
--> statement-breakpoint
CREATE TABLE "activity_assets" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"activity_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "activity_assets_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "activity_assets_org_id_activity_id_asset_id_unique" UNIQUE("org_id","activity_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_items_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "content_items_org_id_id_type_unique" UNIQUE("org_id","id","type"),
	CONSTRAINT "content_items_type_check" CHECK ("content_items"."type" in ('course', 'download'))
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"type" text GENERATED ALWAYS AS ('course') STORED NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"thumbnail_asset_id" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "courses_org_id_slug_unique" UNIQUE("org_id","slug")
);
--> statement-breakpoint
CREATE TABLE "download_assets" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"download_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"display_name" text,
	CONSTRAINT "download_assets_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "download_assets_org_id_download_id_asset_id_unique" UNIQUE("org_id","download_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "downloads" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"type" text GENERATED ALWAYS AS ('download') STORED NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"thumbnail_asset_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "downloads_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "downloads_org_id_slug_unique" UNIQUE("org_id","slug")
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"course_id" text NOT NULL,
	"title" text NOT NULL,
	"seq" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modules_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "modules_org_id_id_course_id_unique" UNIQUE("org_id","id","course_id")
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"content_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "entitlements_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "entitlements_org_id_org_user_id_content_id_unique" UNIQUE("org_id","org_user_id","content_id")
);
--> statement-breakpoint
CREATE TABLE "progress_records" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"position" jsonb,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_records_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "progress_records_org_id_org_user_id_target_type_target_id_unique" UNIQUE("org_id","org_user_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"ciphertext" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credentials_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"integration_id" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"credential_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "connections_org_id_integration_id_unique" UNIQUE("org_id","integration_id")
);
--> statement-breakpoint
CREATE TABLE "event_outbox" (
	"org_id" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"automation_id" text NOT NULL,
	"trigger" text NOT NULL,
	"event_id" text NOT NULL,
	"event" jsonb NOT NULL,
	"status" text NOT NULL,
	"action_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "automation_runs_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger" text NOT NULL,
	"actions" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automations_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"org_id" text NOT NULL,
	"namespace" text NOT NULL,
	"scope_id" text NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_org_id_namespace_scope_id_pk" PRIMARY KEY("org_id","namespace","scope_id")
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
CREATE TABLE "ba_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ba_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"inviter_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ba_jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ba_member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ba_oauth_access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text,
	"reference_id" text,
	"refresh_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"scopes" text[] NOT NULL,
	CONSTRAINT "ba_oauth_access_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "ba_oauth_client" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"disabled" boolean DEFAULT false,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"subject_type" text,
	"scopes" text[],
	"user_id" text,
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" text[],
	"tos" text,
	"policy" text,
	"software_id" text,
	"software_version" text,
	"software_statement" text,
	"redirect_uris" text[] NOT NULL,
	"post_logout_redirect_uris" text[],
	"token_endpoint_auth_method" text,
	"grant_types" text[],
	"response_types" text[],
	"public" boolean,
	"type" text,
	"require_pkce" boolean,
	"reference_id" text,
	"metadata" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	CONSTRAINT "ba_oauth_client_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "ba_oauth_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text,
	"reference_id" text,
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ba_oauth_refresh_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text NOT NULL,
	"reference_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revoked" timestamp with time zone,
	"auth_time" timestamp with time zone,
	"scopes" text[] NOT NULL,
	CONSTRAINT "ba_oauth_refresh_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "ba_organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "ba_organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ba_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "ba_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "ba_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ba_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "ba_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_users" ADD CONSTRAINT "org_users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_users" ADD CONSTRAINT "org_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_org_id_module_id_course_id_modules_org_id_id_course_id_fk" FOREIGN KEY ("org_id","module_id","course_id") REFERENCES "public"."modules"("org_id","id","course_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_assets" ADD CONSTRAINT "activity_assets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_assets" ADD CONSTRAINT "activity_assets_org_id_activity_id_activities_org_id_id_fk" FOREIGN KEY ("org_id","activity_id") REFERENCES "public"."activities"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_assets" ADD CONSTRAINT "activity_assets_org_id_asset_id_assets_org_id_id_fk" FOREIGN KEY ("org_id","asset_id") REFERENCES "public"."assets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_org_id_id_type_content_items_org_id_id_type_fk" FOREIGN KEY ("org_id","id","type") REFERENCES "public"."content_items"("org_id","id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_org_id_thumbnail_asset_id_assets_org_id_id_fk" FOREIGN KEY ("org_id","thumbnail_asset_id") REFERENCES "public"."assets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_assets" ADD CONSTRAINT "download_assets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_assets" ADD CONSTRAINT "download_assets_org_id_download_id_downloads_org_id_id_fk" FOREIGN KEY ("org_id","download_id") REFERENCES "public"."downloads"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_assets" ADD CONSTRAINT "download_assets_org_id_asset_id_assets_org_id_id_fk" FOREIGN KEY ("org_id","asset_id") REFERENCES "public"."assets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_org_id_id_type_content_items_org_id_id_type_fk" FOREIGN KEY ("org_id","id","type") REFERENCES "public"."content_items"("org_id","id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_org_id_thumbnail_asset_id_assets_org_id_id_fk" FOREIGN KEY ("org_id","thumbnail_asset_id") REFERENCES "public"."assets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_org_id_course_id_courses_org_id_id_fk" FOREIGN KEY ("org_id","course_id") REFERENCES "public"."courses"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_org_id_content_id_content_items_org_id_id_fk" FOREIGN KEY ("org_id","content_id") REFERENCES "public"."content_items"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_records" ADD CONSTRAINT "progress_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_records" ADD CONSTRAINT "progress_records_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_org_id_credential_ref_credentials_org_id_id_fk" FOREIGN KEY ("org_id","credential_ref") REFERENCES "public"."credentials"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "ba_account" ADD CONSTRAINT "ba_account_user_id_ba_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ba_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_invitation" ADD CONSTRAINT "ba_invitation_organization_id_ba_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."ba_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_invitation" ADD CONSTRAINT "ba_invitation_inviter_id_ba_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."ba_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_member" ADD CONSTRAINT "ba_member_organization_id_ba_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."ba_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_member" ADD CONSTRAINT "ba_member_user_id_ba_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ba_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD CONSTRAINT "ba_oauth_access_token_client_id_ba_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."ba_oauth_client"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD CONSTRAINT "ba_oauth_access_token_session_id_ba_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ba_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD CONSTRAINT "ba_oauth_access_token_user_id_ba_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ba_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD CONSTRAINT "ba_oauth_access_token_refresh_id_ba_oauth_refresh_token_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "public"."ba_oauth_refresh_token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ADD CONSTRAINT "ba_oauth_client_user_id_ba_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ba_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_consent" ADD CONSTRAINT "ba_oauth_consent_client_id_ba_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."ba_oauth_client"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_consent" ADD CONSTRAINT "ba_oauth_consent_user_id_ba_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ba_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD CONSTRAINT "ba_oauth_refresh_token_client_id_ba_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."ba_oauth_client"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD CONSTRAINT "ba_oauth_refresh_token_session_id_ba_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ba_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD CONSTRAINT "ba_oauth_refresh_token_user_id_ba_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ba_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_session" ADD CONSTRAINT "ba_session_user_id_ba_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ba_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_email_uq" ON "invitations" USING btree ("org_id","email") WHERE "invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "event_outbox_pending_idx" ON "event_outbox" USING btree ("id") WHERE "event_outbox"."processed_at" is null;--> statement-breakpoint
CREATE INDEX "automation_runs_org_automation_idx" ON "automation_runs" USING btree ("org_id","automation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_org_automation_event_idx" ON "automation_runs" USING btree ("org_id","automation_id","event_id");--> statement-breakpoint
CREATE INDEX "automations_org_trigger_idx" ON "automations" USING btree ("org_id","trigger");--> statement-breakpoint
CREATE INDEX "comment_reports_open_idx" ON "comment_reports" USING btree ("org_id","comment_id","resolved_at");--> statement-breakpoint
CREATE INDEX "comments_activity_idx" ON "comments" USING btree ("org_id","activity_id","status","created_at");--> statement-breakpoint
CREATE INDEX "comments_queue_idx" ON "comments" USING btree ("org_id","status","created_at");--> statement-breakpoint
CREATE INDEX "ba_oauth_access_token_client_id_idx" ON "ba_oauth_access_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "ba_oauth_access_token_session_id_idx" ON "ba_oauth_access_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ba_oauth_access_token_user_id_idx" ON "ba_oauth_access_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ba_oauth_access_token_refresh_id_idx" ON "ba_oauth_access_token" USING btree ("refresh_id");--> statement-breakpoint
CREATE INDEX "ba_oauth_client_user_id_idx" ON "ba_oauth_client" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ba_oauth_consent_client_id_idx" ON "ba_oauth_consent" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "ba_oauth_consent_user_id_idx" ON "ba_oauth_consent" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ba_oauth_refresh_token_client_id_idx" ON "ba_oauth_refresh_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "ba_oauth_refresh_token_session_id_idx" ON "ba_oauth_refresh_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ba_oauth_refresh_token_user_id_idx" ON "ba_oauth_refresh_token" USING btree ("user_id");