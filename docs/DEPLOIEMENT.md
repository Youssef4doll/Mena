# Mettre Mena en ligne

Durée : environ 30 minutes. Coût de départ : 0 DT (offres gratuites de Vercel et Neon), plus le nom de domaine.

## 1. Le code sur GitHub

Le code est sur [github.com/Youssef4doll/Mena](https://github.com/Youssef4doll/Mena), branche `main`. Vercel le lit directement depuis GitHub.

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
| `ANTHROPIC_API_KEY` | facultatif : la traduction automatique en arabe tunisien dans le back-office. Créez une clé sur [platform.claude.com](https://platform.claude.com) (*API Keys*). Elle reste sur le serveur, jamais dans le navigateur. Quelques centimes par produit traduit. |
| `NEXT_PUBLIC_DEFAULT_LANG` | facultatif. Sans elle, la boutique s'ouvre **en arabe** (`mena.tn/…`) et le français est sous `mena.tn/fr/…`. Mettez `fr` pour l'inverse. |

4. *Deploy*. À chaque déploiement, la base est mise à jour et le compte admin suit `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Pour changer de mot de passe : modifiez `ADMIN_PASSWORD`, puis *Redeploy*. Une variable ajoutée ou modifiée ne compte qu'au déploiement suivant.

Le back-office est à l'adresse `/admin`.

## 4. Le nom de domaine

Un `.tn` s'achète chez un registrar agréé par l'ATI. Dans Vercel, *Settings → Domains*, ajoutez le domaine et recopiez chez le registrar les enregistrements DNS indiqués.

## 5. Les réglages, dans le back-office

*Paramètres* :

- **Boutique** : téléphone, e-mail, adresse, matricule fiscal. Ils apparaissent dans le pied de page et les conditions de vente.
- **WhatsApp** : votre numéro. Sans lui, les boutons WhatsApp ne s'affichent pas.
- **Livraison** : **un seul tarif pour tous les gouvernorats** (8 DT par défaut, champ « Frais de livraison, tous les gouvernorats »), puis le délai (en jours ouvrés) par gouvernorat. Par défaut : 1 à 2 jours pour le Grand Tunis, 2 à 3 jours ailleurs. **À corriger avec vos vrais délais.** Ajoutez aussi un seuil de livraison offerte si votre marge le permet (par exemple 150 DT).
- **Pixels** : les identifiants Meta, TikTok et GA4, et les jetons serveur (API Conversions). Ils ne se chargent que chez les visiteurs qui acceptent les cookies.
- **SMS** : l'adresse de la passerelle de votre fournisseur de SMS. Sans passerelle, rien n'est envoyé, mais chaque message reste visible dans la commande, et le bouton WhatsApp le pré-remplit.

## 6. Les produits

*Produits → Nouveau produit*. La boutique s'affiche d'abord en arabe : remplissez les champs en arabe ; le français sert aux clients qui passent en français (et remplace un champ arabe laissé vide). Pour chaque produit :

- **traduction automatique** : écrivez dans une seule langue (français ou arabe). En haut de la carte *Texte*, « Traduire ce qui manque » écrit l'autre langue en arabe tunisien (ou en français), les noms des options, des offres, et les mots-clés de recherche. Case cochée « Traduire automatiquement en enregistrant » : c'est fait à chaque enregistrement, seulement pour les champs vides. Relisez toujours le texte arabe. Il faut la variable `ANTHROPIC_API_KEY` (étape 3) ;
- **nom** : comme sur Amazon, mettez-y les mots que les clients tapent sur Google (« Lampe de chevet tactile LED rechargeable » plutôt que « Lampe ») ;
- **description courte** : une ou deux phrases sous le nom, le premier texte lu (300 caractères au plus) ;
- **photos du produit** : 4 à 8, carrées de préférence (le produit seul, en situation, de près, ses dimensions). Téléversez-les depuis le téléphone ou l'ordinateur (elles sont allégées avant l'envoi), ou collez le lien d'une photo du fournisseur (elle est copiée chez vous). La première est la photo principale. Le client les fait glisser, et les ouvre en plein écran avec un zoom ;
- **vidéo** (facultatif) : un lien YouTube (vidéo ou Short) ou l'adresse `https://` d'un fichier `.mp4`. Elle s'affiche en 2e position dans les photos et ne se charge que si le client appuie dessus ;
- **description détaillée**, **caractéristiques** (une par ligne, « Matière : inox ») et **images de description** : les grandes images verticales qui expliquent le produit, comme sur Amazon. Tout cela s'affiche sous le formulaire de commande, les images l'une sous l'autre en pleine largeur ;
- **coût fournisseur** : jamais affiché aux clients, il sert à calculer votre marge ;
- **stock** : « Stock fournisseur » en dropshipping (aucune quantité n'est affichée ; décochez « Disponible » quand le fournisseur est en rupture), ou « Je compte » si vous gardez du stock ;
- **ancien prix** : seulement s'il a vraiment été pratiqué ;
- **catégorie** : dans *Catégories*, un titre d'accroche (« Pour la maison ») s'affiche sur les cartes de l'accueil.

**Offres** (carte *Offres* du produit) : par exemple « 1 unité » à 69 DT et « Achetez 2, la 3e offerte » à 138 DT. Le bouton *Proposer « 1 » et « 2 + 1 offerte »* les crée à partir du prix. Pour chaque offre : le nombre d'unités, le prix total, la livraison offerte ou non, et un dernier jour si l'offre est limitée (la date affichée est celle que vous saisissez, jamais une date inventée).

- Le prix barré « au lieu de » d'un lot est calculé à partir de votre offre « 1 unité ». Sans offre « 1 unité », aucun prix barré n'est affiché.
- « Le plus choisi » n'apparaît que si une offre a vraiment été commandée au moins 3 fois en 60 jours, et plus que les autres.
- Les offres s'appliquent au prix du produit. Si une variante a son propre prix, retirez-le, ou retirez les offres.
- Un lot plus grand que le stock compté est grisé automatiquement.

**Google et recherche** (carte du produit) :

- **mots-clés de recherche** : autres noms, fautes fréquentes, mots en arabe et en tunisien écrit en lettres latines (« lamba », « zarbia », « sechouar »). Jamais affichés ; la recherche de la boutique les trouve. La traduction automatique les propose ;
- **titre et description pour Google** : laissez vide, la boutique les compose (nom, catégorie, description courte, prix, paiement à la livraison) ; l'aperçu montre le résultat Google en arabe et en français ;
- **adresse de la page** : si vous la changez, l'ancienne continue de mener au produit (redirection permanente), pour les liens déjà partagés et pour Google.

La recherche de la boutique trouve un produit même avec une faute de frappe (« lamep » → lampe, « difusseur » → diffuseur), en français, en arabe ou en tunisien en lettres latines, par son nom, ses options, sa catégorie, ses mots-clés et sa description courte. Elle complète ce que le client tape, comme Google.

**Ce que la boutique affiche d'elle-même, seulement quand c'est vrai** : « +20 commandes » sur les cartes et les fiches (commandes confirmées des 30 derniers jours, arrondies vers le bas, rien en dessous de 10) ; « Livraison offerte » quand le prix affiché l'inclut ; l'offre lot la plus avantageuse ; le pourcentage, calculé sur un prix réel.

**Le panier** : « Acheter maintenant » commande tout de suite le produit de la fiche ; « Ajouter au panier », juste dessous, le garde pour commander plusieurs produits ensemble depuis la page *Panier* (même formulaire, mêmes contrôles). Une offre lot reste une seule fois par commande.

Une boutique en ligne ne contient pas de produits de démonstration. Pour voir à quoi elle ressemble pleine, lancez `npm run db:seed:demo` en local ; *Produits → Supprimer la démo* les retire.

## 7. Les liens des publicités

Ajoutez à chaque lien de pub :

```
https://mena.tn/produit/lampe-de-chevet-tactile?utm_source=facebook&utm_medium=paid&utm_campaign=lampe-octobre
```

`utm_source` : facebook, instagram ou tiktok. `utm_campaign` : un nom par campagne. *Analytics → Sources* et *Campagnes* montrent ensuite, pour chaque pub, les visites, les commandes, les commandes confirmées, les livraisons et les refus.

Conseil : envoyez les pubs directement sur la **fiche produit**, pas sur l'accueil. Le lien sans préfixe ouvre la fiche en arabe ; pour une pub en français, ajoutez `/fr` : `https://mena.tn/fr/produit/…`.

## 8. La routine quotidienne

1. **Tableau de bord → À appeler en premier** : appelez, ou envoyez le WhatsApp de confirmation pré-rempli, puis notez le résultat. Les commandes à risque (liste noire, refus passés, doublons) sont en tête de file.
2. **Fournisseurs** : la liste « À commander maintenant » regroupe les commandes confirmées de chaque fournisseur.
3. **Commandes → Confirmées** : passez-les en « Expédiée » avec le numéro de suivi. Le client reçoit un SMS si une passerelle est configurée.
4. Au retour du livreur : « Livrée » ou « Refusée » (avec le motif). Les refus alimentent la liste noire et le taux de refus par gouvernorat.
5. **Non terminées** : les clients qui ont écrit leur numéro sans confirmer. Relancez-les une fois sur WhatsApp ; le lien du message rouvre la fiche sur leur offre et leur option.
6. **Avis** : publiez les avis reçus. Seuls les clients livrés peuvent en laisser.

## Paiement par carte (plus tard)

Le formulaire de la fiche produit propose uniquement le paiement à la livraison, sans e-mail, pour rester simple. Le code pour Konnect existe côté serveur mais n'est pas proposé aux clients. Pour l'activer plus tard, il faudra ajouter le choix du paiement au formulaire.

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
