-- The page a long picture shows on: "ar", "fr", or NULL for both.
-- Additive and nullable: every existing picture keeps showing on both pages.
ALTER TABLE "ProductImage" ADD COLUMN "lang" TEXT;
