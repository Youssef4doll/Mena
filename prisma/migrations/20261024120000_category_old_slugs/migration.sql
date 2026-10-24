-- Former category addresses, redirected to the current one.
ALTER TABLE "Category" ADD COLUMN "oldSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- The default French tagline had a grammar mistake ("Des belles choses"): corrected only where the shop never changed it.
UPDATE "Setting"
SET "value" = jsonb_set("value"::jsonb, '{shop,tagline}', to_jsonb('De belles choses, livrées chez vous. Vous payez à la réception.'::text))
WHERE "key" = 'settings' AND "value"::jsonb #>> '{shop,tagline}' = 'Des belles choses, livrées chez vous. Vous payez à la réception.';
