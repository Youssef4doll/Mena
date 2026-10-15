# Audit conversion — octobre 2026

Objectif : plus de commandes **livrées et rentables**, pas plus de commandes tout court. Aucune donnée réelle de trafic n'existe encore (base locale de démonstration, 12 produits) : **aucun taux de conversion n'est mesuré ici**, et chaque gain attendu ci-dessous est une **hypothèse**, à vérifier dans *Analytics* une fois les publicités lancées.

## Méthode

1. Lecture du code et parcours réel sur téléphone (360, 375, 390, 430 px) et ordinateur, en arabe et en français, sur la version de développement et sur une version de production locale.
2. Onze zones auditées, chacune avec ses preuves (lignes de code, mesures, captures) : arrivée depuis une pub et accueil, listes et recherche, fiche produit, panier, envoi de commande, après la commande, mesure, vitesse, accessibilité, textes, marges. Les quatre premières ont été faites par des agents puis relues ; les sept autres, à la main, avec des tests navigateur et des requêtes falsifiées envoyées au serveur.
3. Correction, puis vérification : types, lint, tests unitaires, tests navigateur, version de production, captures, mesures de vitesse.

## A. Avant / après

Notes **estimées** (qualité d'usage, sur 10), sauf la vitesse, **mesurée**.

| Zone | Avant | Après | Ce qui justifie la note |
|---|---|---|---|
| Arrivée depuis une pub, accueil | 6,5 | 7,5 | Le bandeau cookies couvrait 96 % du bouton de commande (mesuré) ; une page introuvable était une impasse. Reste : l'identité du vendeur dépend des Paramètres. |
| Listes et recherche | 6,5 | 8 | 11 recherches réalistes de 2 mots sur 14 ne trouvaient rien alors que le produit existe (« sac femme ») ; le tri « les plus commandés » comptait les refus. |
| Fiche produit | 6 | 8 | Sur un écran de 600 à 640 px (navigateur de Facebook), ni prix ni bouton au premier écran ; délai, retours et questions absents avant le bouton. |
| Panier | 6,5 | 8 | Retour du téléphone quittait le site ; un produit commandé restait au panier (2e commande en un appui) ; « 1 unité » + « 2 unités » coûtait 62,900 DT de plus que le lot de 3. |
| Envoi de la commande | 6 | 9 | Pas de protection contre l'envoi double (réponse perdue, 2e appui) ; bouton réactivé pendant le chargement de « Merci » ; pas de délai maximum ; un calcul de prix refusé (429) bloquait la commande ; chiffres arabes refusés dans le téléphone. |
| Après la commande | 7 | 7,5 | File d'appels, liste noire, suivi par lien secret : déjà solides. Ajouté : commandes WhatsApp saisissables, doublon détecté sur un produit commun. |
| Mesure | 6,5 | 8,5 | Ni dépenses pub, ni coût de transport, ni coût par commande livrée. Clics WhatsApp du pied de page non comptés ; identifiant de clic Facebook perdu après navigation. |
| Textes et confiance | 6 | 6,5 | Pas de point d'exclamation, promesses tirées des Paramètres. Reste : vendeur, adresse et matricule vides ; conditions de vente en français seulement. |
| Marges | 5 | 7 | La marge d'une offre « livraison offerte » ignorait le transport. Reste : les vrais coûts sont à saisir. |

**Vitesse mesurée** (version de production locale, téléphone simulé : 4G lente 1,6 Mb/s, 150 ms, processeur ×4 ; médiane de 3 chargements) : voir la section C. Décalage de mise en page : 0 partout, sauf le panier (0,143), corrigé.

## B. Ce qui a changé

**Commandes : jamais deux pour une** — `src/lib/orders.ts`, `OrderForm.tsx`, migration `order_submit_key`.
- Chaque envoi porte une clé aléatoire. Le même envoi reçu deux fois (réponse perdue, deux appuis, trois requêtes simultanées testées) donne **une** commande, et le serveur rend la même référence.
- Le bouton reste bloqué jusqu'à la page « Merci ». Sans réponse après 25 s : « Pas de réponse… la commande ne sera pas enregistrée deux fois ».
- Le produit commandé depuis sa fiche quitte le panier. « Doublon possible » dès qu'un produit est en commun avec une commande ouverte du même numéro (48 h).
- Si le calcul du prix échoue, il est relancé (1,5 s, 4 s, 10 s, retour du réseau) ; la commande peut partir avec le total affiché, que le serveur revérifie. Limite des calculs de prix relevée à 300/min par adresse (opérateurs mobiles partagés).
- Téléphone accepté en chiffres arabes (٢٢١٢٣٤٥٦) ou avec un 0 devant.

**Fiche produit** — `ProductView.tsx`, `BuyBox.tsx`, `OrderForm.tsx`.
- Barre du bas dès le premier écran, cachée quand le formulaire est à l'écran ; elle mène à l'option, puis au premier champ vide, sinon au bouton.
- Une ligne sous le prix : tarif et délai de livraison. Paiement à la livraison et colis vérifiable juste avant le bouton. Délai affiché avant même le choix du gouvernorat.
- « قبل ما تطلب » : délai, paiement, appel de confirmation, retour — fermées par défaut, réponses tirées des Paramètres.
- Rupture de stock : WhatsApp « اسألنا وقتاش يرجع » et autres produits. Autres produits complétés quand la catégorie est petite. Un lot avec options dit « même option pour les 3 pièces ».
- Fil d'Ariane masqué sur téléphone (gardé pour Google).

**Panier et commande rapide** — `back-to-close.ts`, `QuickSheet.tsx`, `CartAdded.tsx`, `cart.ts`, `CartView.tsx`.
- Retour du téléphone ferme la fenêtre au lieu de quitter le site.
- Une autre offre du même produit **remplace** la précédente (« تبدّل العرض في السلة »).
- « + » s'arrête au stock réel ; une ligne à refaire mène à son produit ; le lien de relance complète un panier déjà rempli ; un formulaire laissé plus tard est de nouveau visible dans « Non terminées ».

**Listes et recherche** — `search.ts`, `catalog.ts`, `recherche/page.tsx`, `categorie/[slug]/page.tsx`.
- Plusieurs mots dont un seul existe : « Produits « sac » — Rien d'exact pour « sac femme » ». Fautes de frappe plus justes (« makina » n'est plus « main »), résultats trop faibles écartés.
- Aucune recherche ni catégorie ne finit sur rien : catégories et produits proposés.
- « Les plus commandés » ne compte que les commandes confirmées. « Moins cher » suit le prix affiché. Les produits épuisés passent en fin de liste.

**Confiance** — `Consent.tsx`, `Footer.tsx`, `contact/page.tsx`, `settings-schema.ts`, `not-found.tsx`.
- Bandeau cookies au-dessus de la barre de commande et du bouton WhatsApp, boutons plus grands.
- Champ « Vendeur » ; vendeur, matricule et page Facebook affichés quand ils sont remplis ; avertissement dans Paramètres tant qu'ils manquent.
- Page introuvable avec des produits (statut 404 gardé).

**Mesure et rentabilité** — `profit.ts`, `analytics.ts`, `depenses/`, `ads-server.ts`, `events.ts`.
- *Dépenses pub* (nouveau menu) et deux coûts privés dans Paramètres (transport par colis, colis revenu). *Analytics → Rentabilité* : CA livré − produits − transport − colis revenus − publicité, et **coût publicitaire par commande livrée**, par source. Ce qui manque est nommé, jamais deviné.
- L'achat peut être signalé à Meta, TikTok et GA4 **à la livraison**.
- Nouveaux événements : produit ouvert depuis quelle liste et à quelle place, barre du bas touchée, cookies acceptés/refusés, page introuvable ; clics WhatsApp et téléphone du pied de page, du menu, de Contact, de « Merci » et du suivi ; identifiant de clic Facebook gardé jusqu'à la commande.
- « Formulaire commencé » ne compte plus un simple appui sur la barre du bas.
- *Commandes → Nouvelle commande* pour les commandes WhatsApp ou téléphone, avec leur canal comme source.
- Éditeur de produit : marge de chaque offre « après transport ».

## C. Vérification

Faits, avec résultat :
- Types (`tsc`) et lint : sans erreur.
- Tests unitaires : 75/75 (dont nouveaux : rentabilité, dépenses sur une période, chiffres arabes, recherche).
- Tests navigateur (Playwright, téléphone) : 15/15, dont un nouveau : réponse perdue puis deuxième appui → une seule commande, même référence ; produit retiré du panier ; Retour ferme la commande rapide.
- Serveur, requêtes falsifiées : quantité 0, −1, 999, 1,5 refusées ; total faux → nouveau total renvoyé ; variante d'un autre produit ignorée ; gouvernorat inconnu refusé ; autre site refusé ; carte refusée. Trois envois identiques simultanés → une commande.
- Back-office : coûts saisis, dépense de 70 DT sur 7 jours → bénéfice et coût par livrée justes (316,8 − 131 − 48 − 4 − 70 = 63,8 DT ; 17,5 DT par livrée). Commande WhatsApp créée, confirmée, source « whatsapp ».
- Captures téléphone : premier écran 360×640 avec prix et bouton ; bandeau cookies au-dessus de la barre ; recherche « sac femme » ; page introuvable avec produits ; pas de défilement horizontal.
- Version de production : construite sans erreur (un avertissement de police, déjà présent).

Vitesse (avant → après) : voir le tableau ajouté en fin de rapport.

## D. Ce qui reste

- **Identité du vendeur** (nom, adresse ou ville, matricule fiscal, page Facebook), vrais numéros (le téléphone 71 123 456 et le WhatsApp 22 123 456 de la démo ressemblent à des exemples) : à saisir.
- **Conditions de vente et confidentialité en arabe** : à faire relire par quelqu'un qui connaît le droit tunisien ; qui paie le retour et comment le client est remboursé ne sont pas écrits.
- **Images de description et photos en français** sur la fiche arabe (contenu de démonstration) ; une option (couleur) ne montre pas sa photo : il faudrait une photo par option.
- **Ancienne adresse de produit** : la redirection perd les paramètres utm d'une pub en cours.
- **Prix barré** : rien ne prouve qu'un « ancien prix » saisi a été pratiqué ; à n'utiliser que s'il est vrai.
- **Délai de traitement** dans les données Google (0 à 1 jour) : à confirmer.
- Pas de pagination au-delà de 120 produits (sans effet aujourd'hui).
- Vercel : le second projet « mena-g9mi » échoue à chaque envoi.

## E. Effet attendu (hypothèses)

| Changement | Étape et mesure visée |
|---|---|
| Clé d'envoi, bouton bloqué, panier vidé | Commandes en double → appels inutiles, colis refusés (confirmé → livré) |
| Barre du bas au premier écran, ligne livraison, questions | Fiche → formulaire commencé, formulaire → commande |
| Bandeau cookies déplacé | Fiche → formulaire ; part des visiteurs qui acceptent (mesurée maintenant) |
| Retour qui ferme, offre remplacée | Panier → commande ; refus à la porte après avoir vu un meilleur prix |
| Recherche plusieurs mots, pages sans impasse | Recherche → fiche (mesuré maintenant par liste et position) |
| Tri « commandés » sur les confirmées | Mix produit vers ce qui est livré |
| Rentabilité, dépenses pub, achat à la livraison | Coût par commande livrée, décisions de budget pub |
| Commande WhatsApp saisie | Livrées par source exactes |

## F. Cinq priorités suivantes

1. **Saisir les vrais chiffres** (coût transport, colis revenu, dépenses pub chaque semaine) puis couper les campagnes dont le coût par livrée dépasse le bénéfice avant pub. Impact fort, effort faible, sans risque.
2. **Photo par option** (couleur → sa photo) et images de description en arabe. Moins de refus « ce n'est pas la couleur ». Effort moyen (schéma + éditeur).
3. **Rappel avant livraison** (SMS ou WhatsApp la veille, avec le total) une fois une passerelle SMS choisie. Taux de livraison. Effort faible, demande un fournisseur SMS.
4. **Test A/B** de la barre du bas ou des questions, dès qu'il y a environ 1 000 visites de fiche par semaine : mesure principale « commandes livrées par visite », garde-fou « taux de refus ».
5. **Redirection d'ancienne adresse qui garde les utm**, et pagination quand le catalogue dépassera 60 produits par catégorie.

## G. Ce qui vous revient

- Paramètres → Boutique : vendeur, adresse ou ville, matricule fiscal, page Facebook, vrais téléphone et WhatsApp.
- Paramètres → Livraison : ce que le transporteur vous facture par colis, et le coût d'un colis refusé.
- Dépenses pub : chaque semaine.
- Choisir quand signaler l'achat aux publicités (à la commande, à la confirmation ou à la livraison), et saisir les jetons serveur Meta/TikTok.
- Faire écrire ou relire les conditions de vente en arabe, et dire qui paie un retour.
- Supprimer (ou configurer) le projet Vercel « mena-g9mi ».
