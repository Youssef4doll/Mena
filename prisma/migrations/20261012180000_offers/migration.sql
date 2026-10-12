-- Offers per product, a line total on order items, card headlines on categories.
ALTER TABLE "Category" ADD COLUMN "headline" TEXT, ADD COLUMN "headlineAr" TEXT;

CREATE TABLE "ProductOffer" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelAr" TEXT,
    "quantity" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "freeDelivery" BOOLEAN NOT NULL DEFAULT false,
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductOffer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProductOffer_productId_idx" ON "ProductOffer"("productId");
ALTER TABLE "ProductOffer" ADD CONSTRAINT "ProductOffer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing lines: the total is what it always was.
ALTER TABLE "OrderItem" ADD COLUMN "lineTotal" INTEGER;
UPDATE "OrderItem" SET "lineTotal" = "unitPrice" * "qty";
ALTER TABLE "OrderItem" ALTER COLUMN "lineTotal" SET NOT NULL;
ALTER TABLE "OrderItem" ADD COLUMN "offerId" TEXT, ADD COLUMN "offerLabel" TEXT;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ProductOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order" ALTER COLUMN "city" SET DEFAULT '';
