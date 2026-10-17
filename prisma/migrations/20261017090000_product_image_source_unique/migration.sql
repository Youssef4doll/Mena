-- One picture per source and kind for a product, enforced by the database:
-- two imports running at once cannot store the same picture twice.
-- Pictures without a source (uploaded before, or by hand) are not concerned: NULLs are distinct.
DROP INDEX IF EXISTS "ProductImage_productId_source_idx";

CREATE UNIQUE INDEX "ProductImage_productId_kind_source_key" ON "ProductImage"("productId", "kind", "source");
