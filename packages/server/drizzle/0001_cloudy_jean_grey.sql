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
ALTER TABLE "content_items" DROP CONSTRAINT "content_items_type_check";--> statement-breakpoint
ALTER TABLE "download_assets" ADD CONSTRAINT "download_assets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_assets" ADD CONSTRAINT "download_assets_org_id_download_id_downloads_org_id_id_fk" FOREIGN KEY ("org_id","download_id") REFERENCES "public"."downloads"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_assets" ADD CONSTRAINT "download_assets_org_id_asset_id_assets_org_id_id_fk" FOREIGN KEY ("org_id","asset_id") REFERENCES "public"."assets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_org_id_id_type_content_items_org_id_id_type_fk" FOREIGN KEY ("org_id","id","type") REFERENCES "public"."content_items"("org_id","id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_org_id_thumbnail_asset_id_assets_org_id_id_fk" FOREIGN KEY ("org_id","thumbnail_asset_id") REFERENCES "public"."assets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_type_check" CHECK ("content_items"."type" in ('course', 'download'));