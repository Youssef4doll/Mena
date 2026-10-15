-- One order per checkout attempt: a retried request returns the order it already made.
ALTER TABLE "Order" ADD COLUMN "submitKeyHash" TEXT;
CREATE UNIQUE INDEX "Order_submitKeyHash_key" ON "Order"("submitKeyHash");
