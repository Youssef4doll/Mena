-- Where each product picture came from, so a CSV import can be run again safely.
ALTER TABLE "ProductImage" ADD COLUMN "source" TEXT;

CREATE INDEX "ProductImage_productId_source_idx" ON "ProductImage"("productId", "source");
