-- Rows written before the create hooks recorded an external id have none, so
-- every auth->domain lookup misses them. The auth provider adopts the domain
-- id, so the external id is the auth row's own id — matched here on the
-- natural key each pair shares (email for people, slug for organizations).
UPDATE "users" u
SET "external_id" = b."id"
FROM "ba_user" b
WHERE lower(b."email") = lower(u."email")
  AND u."external_id" IS NULL;
--> statement-breakpoint
UPDATE "organizations" o
SET "external_id" = b."id"
FROM "ba_organization" b
WHERE b."slug" = o."slug"
  AND o."external_id" IS NULL;
