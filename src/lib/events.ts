/**
 * The event names the site may record. Anything else is refused by
 * /api/events — the funnel is only as good as its vocabulary.
 */
export const CLIENT_EVENTS = [
  "page_view",
  "product_viewed",
  "quick_buy_opened",
  "add_to_cart",
  "remove_from_cart",
  "cart_viewed",
  "video_played",
  "gallery_zoomed",
  "category_viewed",
  "checkout_started",
  "checkout_phone_entered",
  "checkout_failed",
  "search",
  "search_suggestion_clicked",
  "whatsapp_clicked",
  "phone_clicked",
  "messenger_clicked",
  "delivery_estimate_checked",
  "gallery_swiped",
  "tracking_viewed",
  "sticky_clicked",
  // The long pictures: the gallery's link to them, the first one reached, the last one passed.
  "details_link_clicked",
  "details_seen",
  "details_end",
  // The order sheet opened in place (from the bottom bar or the end of the page).
  "order_sheet_opened",
  "list_item_clicked",
  "consent_granted",
  "consent_denied",
  "not_found",
] as const;

export const SERVER_EVENTS = [
  "order_placed",
  "order_confirmed",
  "order_shipped",
  "order_delivered",
  "order_refused",
  "order_cancelled",
  "order_returned",
] as const;

export type ClientEvent = (typeof CLIENT_EVENTS)[number];
export type ServerEvent = (typeof SERVER_EVENTS)[number];

export const EVENT_LABELS: Record<string, string> = {
  page_view: "Pages vues",
  product_viewed: "Fiches produit vues",
  quick_buy_opened: "Commandes rapides ouvertes",
  category_viewed: "Catégories vues",
  add_to_cart: "Ajouts au panier",
  remove_from_cart: "Retraits du panier",
  cart_viewed: "Paniers ouverts",
  checkout_started: "Formulaires commencés",
  checkout_phone_entered: "Téléphones saisis",
  checkout_failed: "Échecs de commande",
  search: "Recherches",
  search_suggestion_clicked: "Suggestions cliquées",
  whatsapp_clicked: "Clics WhatsApp",
  phone_clicked: "Appels depuis le site",
  details_link_clicked: "Lien vers les détails en images",
  details_seen: "Détails en images vus",
  details_end: "Détails en images vus jusqu'au bout",
  order_sheet_opened: "Commandes ouvertes en fenêtre",
  messenger_clicked: "Clics Messenger",
  delivery_estimate_checked: "Estimations de livraison",
  gallery_swiped: "Photos parcourues",
  video_played: "Vidéos lancées",
  gallery_zoomed: "Photos en plein écran",
  tracking_viewed: "Suivis consultés",
  sticky_clicked: "Barre « Acheter » du bas touchée",
  list_item_clicked: "Produits ouverts depuis une liste",
  consent_granted: "Cookies acceptés",
  consent_denied: "Cookies refusés",
  not_found: "Pages introuvables",
  order_placed: "Commandes passées",
  order_confirmed: "Commandes confirmées",
  order_shipped: "Commandes expédiées",
  order_delivered: "Commandes livrées",
  order_refused: "Refus à la livraison",
  order_cancelled: "Commandes annulées",
  order_returned: "Retours",
};
