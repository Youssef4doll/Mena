# Mettre Mena en ligne

Durée : environ 30 minutes. Coût de départ : 0 DT (offres gratuites de Vercel et Neon), plus le nom de domaine.

## 1. Le code sur GitHub

Le code est sur [github.com/Youssef4doll/Mena](https://github.com/Youssef4doll/Mena), branche `main`. Vercel le lit directement depuis GitHub.

## 2. La base de données (Neon)

1. Créez un compte sur [neon.tech](https://neon.tech), puis un projet en région **Europe (Frankfurt)**, la plus proche de la Tunisie. C'est aussi la région des fonctions Vercel (`fra1`, dans `vercel.json`) : une base dans une autre région (par exemple aux États-Unis, souvent proposée par défaut) ajoute environ 0,1 s à chaque échange avec la base, et le back-office devient lent. Pour vérifier un projet existant : Neon → *Settings* → *General* → *Region*.
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
| `ANTHROPIC_API_KEY` | facultatif : la traduction automatique en arabe tunisien dans le back-office, et la fiche écrite par l'IA dans *Produits → Depuis Ecomness*. Créez une clé sur [platform.claude.com](https://platform.claude.com) (*API Keys*). Elle reste sur le serveur, jamais dans le navigateur. Quelques centimes par produit traduit. |
| `NEXT_PUBLIC_DEFAULT_LANG` | facultatif. Sans elle, la boutique s'ouvre **en arabe** (`mena.tn/…`) et le français est sous `mena.tn/fr/…`. Mettez `fr` pour l'inverse. |

4. *Deploy*. À chaque déploiement, la base est mise à jour et le compte admin suit `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Pour changer de mot de passe : modifiez `ADMIN_PASSWORD`, puis *Redeploy*. Une variable ajoutée ou modifiée ne compte qu'au déploiement suivant.

Le back-office est à l'adresse `/admin`.

## 4. Le nom de domaine

Un `.tn` s'achète chez un registrar agréé par l'ATI. Dans Vercel, *Settings → Domains*, ajoutez le domaine et recopiez chez le registrar les enregistrements DNS indiqués.

## 5. Les réglages, dans le back-office

*Paramètres* :

- **Boutique** : le vrai téléphone, l'e-mail, l'adresse (au moins la ville), le **vendeur** (nom de la société ou de la personne) et le matricule fiscal, la page Facebook. Ils apparaissent dans le pied de page, la page Contact et les conditions de vente : c'est ce que regardent les clients qui hésitent avant une commande à la livraison. Un avertissement reste affiché tant que l'adresse ou le matricule manquent.
- **Réseaux sociaux** : l'adresse complète de votre profil (ex. `https://www.instagram.com/votre.page`, `https://www.tiktok.com/@votre.page`), ou rien. Une adresse sans profil (`https://www.instagram.com/`) ou d'un autre site est refusée à l'enregistrement et n'est jamais affichée. **Messenger** : le nom d'utilisateur de votre page Facebook, celui de `m.me/…` (au moins 5 lettres ou chiffres), ou rien.
- **WhatsApp** : votre numéro. Sans lui, les boutons WhatsApp ne s'affichent pas.
- **Livraison** : **un seul tarif pour tous les gouvernorats** (8 DT par défaut, champ « Frais de livraison, tous les gouvernorats »), puis le délai (en jours ouvrés) par gouvernorat. Par défaut : 1 à 2 jours pour le Grand Tunis, 2 à 3 jours ailleurs. **À corriger avec vos vrais délais.** Ajoutez aussi un seuil de livraison offerte si votre marge le permet (par exemple 150 DT).
- **Ce que vous payez par colis** (carte *Livraison*, jamais affiché aux clients) : ce que le transporteur vous facture par colis, et le coût en plus d'un colis refusé ou retourné. Avec eux, *Analytics → Rentabilité* donne le vrai bénéfice, et l'éditeur de produit la marge de chaque offre « après transport ».
- **Pixels** : les identifiants Meta, TikTok et GA4, et les jetons serveur (API Conversions). Ils ne se chargent que chez les visiteurs qui acceptent les cookies. « Signaler l'achat aux publicités » : à la commande, à la confirmation, ou **à la livraison** (les publicités apprennent seulement sur les clients qui ont payé ; il faut alors les jetons serveur et assez de livraisons par semaine).
- **E-mail à chaque commande** (carte *SMS et e-mails*) : un e-mail **à vous seul** à chaque nouvelle commande (client, téléphone, adresse, articles, total, lien vers la commande), à l'adresse « Recevoir chaque nouvelle commande à » (vide : l'e-mail de la boutique). Il faut un compte [Resend](https://resend.com) : sa clé API et l'adresse d'expéditeur. Aucun e-mail n'est envoyé aux clients.
- **Photos d'accueil** (carte *Page d'accueil*) : jusqu'à 8 photos qui défilent en haut de l'accueil, chacune avec son lien (un produit, une catégorie, toute la boutique, ou une autre adresse pour une promotion) et sa description pour les lecteurs d'écran. Format large, environ 1600 × 700 px. Avant, Après et Retirer changent l'ordre ; enregistrez en bas de la page. Sur ordinateur, une flèche de chaque côté fait passer d'une photo à l'autre ; sur téléphone, on glisse du doigt.
- **SMS** : l'adresse de la passerelle de votre fournisseur de SMS. Sans passerelle, rien n'est envoyé, mais chaque message reste visible dans la commande, et le bouton WhatsApp le pré-remplit.

## 6. Les produits

*Produits → Nouveau produit*. La boutique s'affiche d'abord en arabe : remplissez les champs en arabe ; le français sert aux clients qui passent en français (et remplace un champ arabe laissé vide). Pour chaque produit :

- **traduction automatique** : écrivez dans une seule langue (français ou arabe). En haut de la carte *Texte*, « Traduire ce qui manque » écrit l'autre langue en arabe tunisien (ou en français), les noms des options, des offres, les mots-clés de recherche, et le titre et la description pour Google quand ils sont vides (comme Amazon : les mots que les clients cherchent d'abord, un vrai avantage, le paiement à la livraison). Case cochée « Traduire automatiquement en enregistrant » : c'est fait à chaque enregistrement, seulement pour les champs vides. Relisez toujours le texte arabe. Il faut la variable `ANTHROPIC_API_KEY` (étape 3). **Sans clé**, le bouton « Traduire avec claude.ai (gratuit) » copie une demande toute prête : collez-la dans [claude.ai](https://claude.ai) (compte gratuit) ou une autre IA, puis collez sa réponse dans la case prévue. Seuls les champs vides sont remplis, rien n'est enregistré avant « Enregistrer » ;
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

Le **titre de chaque offre est sa quantité**, écrit par la boutique (« زوز حبات », « 3 unités ») ; votre nom d'offre s'affiche dessous seulement s'il dit quelque chose de plus et parle de la même quantité. Un nom qui annonce une autre quantité (« Achetez 2, la 3e offerte » sur une offre de 2) est refusé à l'enregistrement, avec le message qui dit quoi corriger. La livraison offerte d'une offre est reprise partout : résumé, questions de la fiche, pages Livraison et Conditions, et données pour Google.

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

**Beaucoup de produits d'un coup** (*Produits → Importer (CSV)*) :

1. Téléchargez le *Modèle vide* ou l'*Exemple rempli* et remplissez-le dans Excel ou Google Sheets : une ligne par produit, seules les colonnes `nom` et `prix` sont obligatoires. Tout en français : il n'y a pas de colonnes en arabe, l'arabe se traduit pendant l'import (avec la clé) ou après (*Traduire en lot*). Prix en dinars (`59,900`), `oui`/`non`, listes séparées par `;`. La liste complète des colonnes est sur la page (« Les colonnes »).
2. **Photos** : dans la colonne `photos`, les liens des photos du fournisseur (`https://…`, liens Google Drive et Dropbox compris), ou les noms des fichiers, que vous choisissez ensuite avec « Choisir des photos » ou « Choisir un dossier ». La première est la photo principale.
3. **Catégories et fournisseurs** : écrivez leur nom ; ceux qui n'existent pas encore sont créés.
4. **Offres et options** : `1 = 59,900 ; 3 = 119,800 livraison offerte` dans `offres`, `Noir ; Blanc` dans `variantes`.
5. Choisissez le fichier, ou collez les lignes copiées depuis le tableur (avec la ligne des titres). La page vérifie tout avant d'envoyer : produits nouveaux, mis à jour, lignes en erreur avec la raison.
6. « Importer » : les produits arrivent quelques-uns à la fois, avec une barre de progression. Gardez la page ouverte. Les nouveaux produits sont créés hors ligne, sauf si vous cochez « Mettre en ligne tout de suite » ; à la fin, un bouton les met en ligne d'un coup.

Un même fichier importé deux fois ne crée rien en double : une ligne dont l'adresse (faite à partir du nom) existe déjà met ce produit à jour, et une photo déjà importée n'est pas reprise. Une case vide ne change rien à un produit existant. *Exporter (CSV)* donne tout le catalogue dans le même format, en français : modifiez-le dans Excel (prix, textes, stock) puis réimportez-le pour changer beaucoup de produits en une fois. Un texte français changé efface son ancien arabe, qui est retraduit (tout de suite avec la clé, sinon avec *Traduire en lot*). Pour relire l'arabe dans un tableur : « Exporter avec l'arabe » dans « Les colonnes » de la page d'import.

Les photos sont gardées dans la base de données. La page d'import indique la place prise et la place estimée de l'import ; l'offre gratuite de Neon s'arrête à 0,5 Go (environ 3 000 photos de produit).

**Des produits Ecomness** (*Produits → Depuis Ecomness*) : collez la liste de « My products » prise par votre extension (Instant Data Scraper…) : chaque produit est créé hors ligne avec sa photo en grand, son coût, son code ENP et son lien, au prix « coût × 2 + 10 DT, arrondi à ,900 » (règle à changer en haut, gardée sur cet ordinateur ; chaque prix se change dans sa ligne). Puis, pour chaque produit, ouvrez sa page chez Ecomness, Ctrl+A, Ctrl+C, et collez-la au même endroit : toutes ses photos en grand, et la fiche écrite en français et en arabe tunisien à partir de la page seulement (avec la clé `ANTHROPIC_API_KEY` ; sans clé, avec claude.ai : copier la demande, coller la réponse). Le produit déjà créé depuis la liste est complété (reconnu par son code), pas copié. Relisez dans l'éditeur, puis mettez en ligne. Les idées de grandes images donnent une demande prête pour Gemini : joignez la photo du produit, collez la demande.

Dans la liste collée, les produits **déjà dans la boutique sont décochés** : « Tout cocher », « Tout décocher », « Les nouveaux seulement » ou « Ceux déjà dans la boutique » choisissent d'un clic, et Maj + clic coche une suite de lignes. Une page produit collée donne **tout de suite sa description**, sans IA : le nom, la description et les caractéristiques de la page, à relire et corriger avant de créer (en français ; l'arabe se fait ensuite avec « Traduire en lot »). La fiche réécrite en français et en arabe reste possible avec la clé ou claude.ai.

**Les grandes images de description** (éditeur du produit, carte *Images de description*, « Faire ces images avec l'IA ») : l'IA lit les textes du produit et prépare 3 à 5 images comme sur Amazon (avantage principal, points forts fléchés, avant / après, en utilisation, dimensions, contenu de la boîte, avec / sans), seulement avec ce que disent les textes. Chaque image a sa demande complète, en arabe ou en français pour le texte sur l'image ; une autre demande fait une seule grande image avec toutes les parties. Dans [Gemini](https://gemini.google.com) : joignez la photo du produit, collez la demande, vérifiez le texte lettre par lettre, puis ajoutez l'image ici avec sa langue. Sans clé, la préparation se fait avec claude.ai (copier la demande, coller la réponse). L'avant / après n'est proposé que pour un résultat visible de tous les jours (rangé / en désordre, cheveux lisses / frisés), jamais pour le poids, le corps, la peau ou la santé.

**Les catégories en arabe** (*Catégories*) : « Traduire en arabe » écrit tout de suite le nom arabe des catégories courantes (Maison → الدار, Cuisine → الكوجينة, Meubles → الموبيليا…), et les autres avec l'IA (ou claude.ai sans clé). Seuls les champs vides sont remplis. Une catégorie créée par un import reçoit son nom arabe dès sa création quand c'est une catégorie courante.

**Le texte arabe de beaucoup de produits** (*Produits → Traduire en lot*) : la page liste les produits dont un texte n'existe que dans une langue. Avec une clé `ANTHROPIC_API_KEY`, un bouton les traduit tous. Sans clé, elle prépare des lots de 8 produits : « Copier la demande », collez-la dans [claude.ai](https://claude.ai) (gratuit), collez la réponse, « Mettre les traductions ». Seuls les champs vides sont remplis ; rien de ce qui est déjà écrit n'est remplacé.

**Travailler vite dans la liste** : prix, stock, « Dispo », « En ligne », « Sélection » et catégorie se changent directement dans la ligne (Entrée enregistre, Échap annule). Cochez plusieurs produits pour les mettre en ligne ou hors ligne, les changer de catégorie ou les supprimer d'un coup. Dans un produit : Ctrl+S enregistre, « Précédent » / « Suivant » passent au produit voisin, « Enregistrer, puis suivant » enchaîne, « Dupliquer » crée une copie hors ligne d'un produit proche. Si le produit a été modifié ailleurs pendant qu'il était ouvert (liste, import, traduction, autre onglet), l'enregistrement est refusé avec un message, au lieu d'effacer ce changement.

**Qualité des fiches** (menu du back-office) : chaque produit noté sur 100, les plus faibles d'abord, avec ce qui lui manque (photos, grandes images de description, description, arabe, vérification fournisseur, caractéristiques, catégorie, textes Google, mots-clés, coût, vidéo, offres cohérentes). Cliquez sur un manque pour ne voir que les fiches concernées.

**Compléter depuis le web** (bouton en haut de *Qualité des fiches*) : pour les fiches qui manquent de photos, de grandes images, de description ou de vidéo. Pour chaque produit coché, les pages du même produit sont cherchées sur le web (la marque, les grandes boutiques), puis la boutique y lit les grandes photos, les images longues de description et la vidéo. Rien n'est enregistré avant « Appliquer à ce produit » : vous gardez les photos (« Photo » en haut de la fiche, « Grande image » sous la description), la vidéo et les textes que vous voulez.
- *Avec la clé `ANTHROPIC_API_KEY`* : l'IA cherche et lit les pages elle-même, une à deux minutes par produit, et écrit les textes en français et en arabe à partir de ce que disent ces pages (jamais copiés, jamais d'avis, de note ou de chiffre de ventes). Chaque recherche est payée sur votre compte Anthropic : essayez d'abord sur quelques produits.
- *Sans la clé* : « Copier la demande » (4 produits à la fois), collez-la dans claude.ai, puis collez toute sa réponse dans la case et « Lire la réponse ».
- *À la main* : sous chaque produit, les liens Google Images, Google, YouTube et Amazon ouvrent la recherche ; collez le lien d'une page du produit (ou l'adresse d'une photo) dans sa case, puis « Lire ces liens ». Amazon refuse souvent la lecture automatique : prenez alors la page de la marque, ou copiez l'adresse des photos.
- Préférez les photos de la marque : les mises en scène d'un autre vendeur sont à lui.

**À vérifier** (onglet de la liste des produits) : les produits en ligne dont vous n'avez pas encore coché « Fiche vérifiée avec le fournisseur » dans l'éditeur (caractéristiques, unités, couleurs, garantie, contenu de la boîte). Rien n'est montré aux clients : c'est votre liste avant de faire de la publicité sur un produit.

**Après une modification** : la fiche du produit modifié change tout de suite. L'accueil, les listes et les autres fiches restent affichés aussitôt aux clients, puis se mettent à jour d'eux-mêmes en quelques secondes : rechargez la page pour les voir changer. Aucun client n'attend pendant ce temps.

Une boutique en ligne ne contient pas de produits de démonstration. Pour voir à quoi elle ressemble pleine, lancez `npm run db:seed:demo` en local ; *Produits → Supprimer la démo* les retire.

## 7. Les liens des publicités

Ajoutez à chaque lien de pub :

```
https://mena.tn/produit/lampe-de-chevet-tactile?utm_source=facebook&utm_medium=paid&utm_campaign=lampe-octobre
```

`utm_source` : facebook, instagram ou tiktok. `utm_campaign` : un nom par campagne. *Analytics → Sources* et *Campagnes* montrent ensuite, pour chaque pub, les visites, les commandes, les commandes confirmées, les livraisons et les refus.

**Dépenses pub** (menu du back-office) : recopiez chaque jour, ou chaque semaine, ce que le gestionnaire de publicités a dépensé, avec la même source (facebook, tiktok…) et, si vous voulez, le nom de campagne de `utm_campaign`. *Analytics → Rentabilité* en tire le **coût publicitaire par commande livrée**, par source, et le bénéfice après publicité. Une campagne qui coûte plus par commande livrée que ce que la commande rapporte avant publicité perd de l'argent, même si elle « fait des commandes ».

**Vos propres visites ne comptent pas** : tant que vous êtes connecté au back-office, vos passages sur la boutique ne sont ni dans les statistiques ni dans les commandes non terminées. Pour un téléphone de test qui ne se connecte pas : *Analytics* → « Exclure cet appareil », depuis ce téléphone.

Conseil : envoyez les pubs directement sur la **fiche produit**, pas sur l'accueil. Si vous mettez un produit en pause alors qu'une pub tourne encore, la page « introuvable » propose d'autres produits, et *Analytics* compte ces visites ; coupez quand même la pub. Le lien sans préfixe ouvre la fiche en arabe ; pour une pub en français, ajoutez `/fr` : `https://mena.tn/fr/produit/…`.

## 8. La routine quotidienne

1. **Tableau de bord → À appeler en premier** : appelez, ou envoyez le WhatsApp de confirmation pré-rempli, puis notez le résultat. Les commandes à risque (liste noire, refus passés, doublons) sont en tête de file. « Doublon possible » : le même numéro a déjà une commande ouverte avec un des mêmes produits ; demandez au client s'il en veut vraiment deux.
   Une commande prise sur WhatsApp ou au téléphone : *Commandes → Nouvelle commande*. Mêmes prix, stock et contrôles que le site, et elle compte dans les statistiques avec son canal (WhatsApp, téléphone…).
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
