-- Product page content: a short line under the name, a specs table, a video, long description pictures.
CREATE TYPE "ImageKind" AS ENUM ('GALLERY', 'DETAIL');

ALTER TABLE "Product" ADD COLUMN "summary" TEXT NOT NULL DEFAULT '',
ADD COLUMN "summaryAr" TEXT,
ADD COLUMN "specs" TEXT NOT NULL DEFAULT '',
ADD COLUMN "specsAr" TEXT,
ADD COLUMN "videoUrl" TEXT;

ALTER TABLE "ProductImage" ADD COLUMN "kind" "ImageKind" NOT NULL DEFAULT 'GALLERY';
