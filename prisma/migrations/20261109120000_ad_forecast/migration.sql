-- A new table only: nothing existing changes.
CREATE TABLE "AdForecast" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "startDay" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "campaign" TEXT,
    "adNames" TEXT[],
    "mode" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "forecast" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdForecast_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdForecast_productId_idx" ON "AdForecast"("productId");
CREATE INDEX "AdForecast_createdAt_idx" ON "AdForecast"("createdAt");
