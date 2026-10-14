-- Search keywords, Google title and description, and the product's former addresses.
ALTER TABLE "Product" ADD COLUMN "keywords" TEXT NOT NULL DEFAULT '',
ADD COLUMN "seoTitle" TEXT NOT NULL DEFAULT '',
ADD COLUMN "seoTitleAr" TEXT,
ADD COLUMN "seoDescription" TEXT NOT NULL DEFAULT '',
ADD COLUMN "seoDescriptionAr" TEXT,
ADD COLUMN "oldSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "Product_oldSlugs_idx" ON "Product" USING GIN ("oldSlugs");
