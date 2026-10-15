-- Advertising spend entered in the back office, for the cost per delivered order.
CREATE TABLE "AdSpend" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL,
    "campaign" TEXT,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdSpend_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdSpend_day_idx" ON "AdSpend"("day");
