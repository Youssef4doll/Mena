-- When the owner checked a product's facts with the supplier; null: not yet.
ALTER TABLE "Product" ADD COLUMN "checkedAt" TIMESTAMP(3);
