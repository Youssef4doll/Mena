/** The settings' fields as the form names them, for messages ("Enregistré : Meta Pixel ID"). */
const LABELS: Record<string, string> = {
  "shop.name": "Nom", "shop.phone": "Téléphone affiché", "shop.email": "E-mail", "shop.tagline": "Phrase d'accroche", "shop.taglineAr": "Phrase d'accroche (arabe)",
  "shop.legalName": "Vendeur", "shop.legalId": "Matricule fiscal", "shop.address": "Adresse", "shop.instagram": "Instagram", "shop.facebook": "Facebook", "shop.tiktok": "TikTok",
  "hero.title": "Titre de l'accueil", "hero.titleAr": "Titre de l'accueil (arabe)", "hero.slides": "Photos d'accueil",
  "contact.whatsapp": "WhatsApp", "contact.messenger": "Messenger",
  "delivery.fee": "Frais de livraison", "delivery.freeThreshold": "Livraison offerte dès", "delivery.zones": "Délais de livraison", "delivery.carrierName": "Nom du transporteur", "delivery.openBeforePaying": "Ouverture du colis avant paiement",
  "costs.carrierPerParcel": "Coût transporteur", "costs.returnPerParcel": "Coût d'un retour",
  "tracking.metaPixelId": "Meta Pixel ID", "tracking.ga4Id": "GA4 ID", "tracking.tiktokPixelId": "TikTok Pixel ID", "tracking.purchaseAt": "Moment de l'achat signalé",
  "notify.orderAlertTo": "E-mail des nouvelles commandes", "notify.emailFrom": "Expéditeur des e-mails",
  "returns.days": "Délai de retour", "checkout.maxOrdersPerPhonePerDay": "Commandes par numéro",
  "secrets.metaCapiToken": "Jeton API Conversions Meta", "secrets.tiktokToken": "Jeton TikTok", "secrets.ga4ApiSecret": "Secret GA4", "secrets.smsKey": "Clé SMS", "secrets.resendKey": "Clé Resend", "secrets.konnectApiKey": "Clé Konnect",
};

export const fieldName = (path: string) => LABELS[path] ?? path;
