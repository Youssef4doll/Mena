# Mettre Mena en ligne

Durée : environ 30 minutes. Coût de départ : 0 DT (offres gratuites de Vercel et Neon), plus le nom de domaine.

## 1. Le code sur GitHub

Créez un dépôt **vide** nommé `mena` sur github.com (compte `Youssef4doll`), sans README. Donnez l'accès à Claude, et le code y sera envoyé sur la branche `main`.

## 2. La base de données (Neon)

1. Créez un compte sur [neon.tech](https://neon.tech), puis un projet en région **Europe (Frankfurt)**, la plus proche de la Tunisie.
2. Dans *Connect*, copiez deux adresses :
   - avec « Connection pooling » activé → ce sera `DATABASE_URL`
   - sans pooling → ce sera `DATABASE_URL_UNPOOLED`

## 3. Le site (Vercel)

1. Sur [vercel.com](https://vercel.com), *Add New → Project*, importez le dépôt `mena`.
2. Région des fonctions : **Frankfurt (fra1)**, dans *Settings → Functions*.
3. Variables d'environnement (*Settings → Environment Variables*) :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | l'adresse Neon avec pooling |
| `DATABASE_URL_UNPOOLED` | l'adresse Neon sans pooling |
| `APP_SECRET` | 40 caractères au hasard (par ex. le résultat de `openssl rand -base64 32`). **Ne le changez plus ensuite** : les liens de suivi envoyés aux clients en dépendent. |
| `ADMIN_EMAIL` | votre e-mail de connexion au back-office |
| `ADMIN_PASSWORD` | un mot de passe d'au moins 10 caractères |
| `NEXT_PUBLIC_SITE_URL` | `https://mena.tn` (votre domaine, sans `/` à la fin) |

4. *Deploy*. À chaque déploiement, la base est mise à jour et le compte admin est créé s'il n'existe pas.

Le back-office est à l'adresse `/admin`.

## 4. Le nom de domaine

Un `.tn` s'achète chez un registrar agréé par l'ATI. Dans Vercel, *Settings → Domains*, ajoutez le domaine et recopiez chez le registrar les enregistrements DNS indiqués.

## 5. Les réglages, dans le back-office

*Paramètres* :

- **Boutique** : téléphone, e-mail, adresse, matricule fiscal. Ils apparaissent dans le pied de page et les conditions de vente.
- **WhatsApp** : votre numéro. Sans lui, les boutons WhatsApp ne s'affichent pas.
- **Livraison** : le tarif et le délai (en jours ouvrés) **par gouvernorat**, d'après la grille de votre société de livraison. Par défaut : 7 DT et 1 à 2 jours pour le Grand Tunis, 8 DT et 2 à 3 jours ailleurs. **À corriger avec vos vrais tarifs.** Ajoutez aussi un seuil de livraison offerte si votre marge le permet (par exemple 150 DT).
- **Pixels** : les identifiants Meta, TikTok et GA4, et les jetons serveur (API Conversions). Ils ne se chargent que chez les visiteurs qui acceptent les cookies.
- **SMS** : l'adresse de la passerelle de votre fournisseur de SMS. Sans passerelle, rien n'est envoyé, mais chaque message reste visible dans la commande, et le bouton WhatsApp le pré-remplit.

## 6. Les produits

*Produits → Nouveau produit*. Pour chaque produit :

- photos : téléversez-les, ou collez le lien d'une photo du fournisseur (elle est copiée chez vous) ;
- **coût fournisseur** : jamais affiché aux clients, il sert à calculer votre marge ;
- **stock** : « Stock fournisseur » en dropshipping (aucune quantité n'est affichée ; décochez « Disponible » quand le fournisseur est en rupture), ou « Je compte » si vous gardez du stock ;
- **ancien prix** : seulement s'il a vraiment été pratiqué.

Une boutique en ligne ne contient pas de produits de démonstration. Pour voir à quoi elle ressemble pleine, lancez `npm run db:seed:demo` en local ; *Produits → Supprimer la démo* les retire.

## 7. Les liens des publicités

Ajoutez à chaque lien de pub :

```
https://mena.tn/produit/lampe-de-chevet-tactile?utm_source=facebook&utm_medium=paid&utm_campaign=lampe-octobre
```

`utm_source` : facebook, instagram ou tiktok. `utm_campaign` : un nom par campagne. *Analytics → Sources* et *Campagnes* montrent ensuite, pour chaque pub, les visites, les commandes, les commandes confirmées, les livraisons et les refus.

Conseil : envoyez les pubs directement sur la **fiche produit**, pas sur l'accueil.

## 8. La routine quotidienne

1. **Tableau de bord → À appeler en premier** : appelez, ou envoyez le WhatsApp de confirmation pré-rempli, puis notez le résultat. Les commandes à risque (liste noire, refus passés, doublons) sont en tête de file.
2. **Fournisseurs** : la liste « À commander maintenant » regroupe les commandes confirmées de chaque fournisseur.
3. **Commandes → Confirmées** : passez-les en « Expédiée » avec le numéro de suivi. Le client reçoit un SMS si une passerelle est configurée.
4. Au retour du livreur : « Livrée » ou « Refusée » (avec le motif). Les refus alimentent la liste noire et le taux de refus par gouvernorat.
5. **Paniers abandonnés** : relancez une fois sur WhatsApp ceux qui ont laissé leur numéro.
6. **Avis** : publiez les avis reçus. Seuls les clients livrés peuvent en laisser.

## Paiement par carte (plus tard)

Le code pour Konnect est prêt mais désactivé. Une fois votre compte Konnect validé, renseignez la clé et le wallet dans *Paramètres → Paiement par carte*. Vérifiez d'abord en mode test : les adresses de l'API Konnect sont à confirmer dans leur documentation.

## Développement en local

```bash
cp .env.example .env    # puis remplir
npm install
npm run db:migrate
npx tsx --env-file=.env prisma/seed.ts
npx tsx --env-file=.env prisma/seed-demo.ts   # facultatif
npm run dev
```

Vérifications :

```bash
npm run typecheck
npm run lint
npm test          # règles de prix, livraison, promo, anti-fraude, etc.
npm run e2e       # parcours complets dans un navigateur, uniquement sur une base locale
```

`npm run e2e` refuse de tourner si la base ou l'adresse testée n'est pas locale. Il utilise la base `mena_test` (`TEST_DATABASE_URL`) et ne supprime jamais de données.
