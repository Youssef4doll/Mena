# Mena

Boutique en ligne pour la Tunisie : dropshipping, paiement à la livraison, français et arabe.

- **Recherche marché** : [docs/RESEARCH.md](docs/RESEARCH.md)
- **Mise en ligne et routine** : [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md)

| Fiche produit | Commande | Arabe | Back-office |
|---|---|---|---|
| ![](docs/screenshots/fiche-produit.webp) | ![](docs/screenshots/commande.webp) | ![](docs/screenshots/accueil-arabe.webp) | ![](docs/screenshots/admin-tableau-de-bord.webp) |

## Boutique

- Mobile d'abord, LCP de 0,9 à 1,4 s en 4G lente sur un téléphone simulé à CPU ralenti ×4.
- Commande en une page, téléphone en premier (+216, 8 chiffres), sans compte, paiement à la livraison. Paiement par carte (Konnect) prêt mais désactivé.
- Frais et délai de livraison par gouvernorat dès la fiche produit, tirés des réglages.
- Bouton WhatsApp sur chaque fiche, et confirmation WhatsApp proposée après la commande.
- Suivi de commande par lien secret (SMS) ou par numéro de commande + téléphone. Demande de retour et avis depuis la page de suivi.
- Panier enregistré côté serveur : les paniers abandonnés avec un numéro peuvent être relancés.
- SEO : métadonnées, sitemap FR/AR, données structurées produit. Pixels Meta, TikTok et GA4 (avec API serveur) chargés seulement après consentement.

**Règle de la maison : n'afficher que des données réelles.** Pas de faux stock, de faux compte à rebours, de faux avis, de faux « X personnes regardent ». Un avis ne peut venir que d'une commande livrée, et n'est publié qu'après modération.

**Le navigateur n'est jamais cru.** Le serveur recalcule prix, variantes, stock, remise, quantités et frais de livraison à chaque devis et à chaque commande. Une commande dont le total diffère de celui affiché est arrêtée, et le client voit le nouveau total.

## Back-office (`/admin`)

Commandes (file de confirmation, appels notés, statuts, refus avec motif, liste noire), produits (photos, variantes, coût fournisseur, stock), catégories, fournisseurs, clients, codes promo, paniers abandonnés, retours, avis, paramètres. Exports CSV.

**Analytics** : mesure d'audience interne, sans service extérieur. Temps réel, visiteurs, entonnoir (visite → fiche → panier → commande → confirmée → livrée), conversion par source, campagne et appareil, CA, panier moyen, marge, produits vus mais pas achetés, recherches sans résultat, paniers abandonnés, refus par gouvernorat, clients fidèles, cohortes, commandes par heure.

## Technique

Next.js 16 (App Router), Prisma 6 et Postgres, déployable sur Vercel. Montants en millimes (entiers). Tests unitaires : `npm test`. Tests navigateur : `npm run e2e`, sur base locale uniquement.
