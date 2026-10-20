-- The ads section: which ad brought a visit (utm_content), and what the
-- platform counted for a spend row, typed by hand or imported from an export.
-- Additive and nullable: existing rows and code keep working.
ALTER TABLE "AnalyticsEvent" ADD COLUMN "content" TEXT;

ALTER TABLE "AdSpend" ADD COLUMN "adSet" TEXT,
ADD COLUMN "ad" TEXT,
ADD COLUMN "impressions" INTEGER,
ADD COLUMN "clicks" INTEGER,
ADD COLUMN "reach" INTEGER,
ADD COLUMN "purchases" INTEGER,
ADD COLUMN "importKey" TEXT;

-- Importing the same export twice replaces its rows: one row per key.
CREATE UNIQUE INDEX "AdSpend_importKey_key" ON "AdSpend"("importKey");
