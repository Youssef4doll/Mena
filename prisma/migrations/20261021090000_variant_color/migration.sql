-- A variant's colour, shown as a dot beside its name in the shop's list.
-- Additive and nullable: existing variants keep working without one.
ALTER TABLE "ProductVariant" ADD COLUMN "colorHex" TEXT;
