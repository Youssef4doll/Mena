/**
 * A demo catalogue so the shop can be seen before the real products are in.
 * Every row is marked isDemo; Back office → Produits → "Supprimer la démo"
 * removes them all. No reviews, no orders, no sales are invented.
 */
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

const prisma = new PrismaClient();

const PALETTES = [
  ["#efe2cf", "#d9c3a3", "#b04f2c"],
  ["#e3ebf7", "#c4d3ea", "#1d4f9e"],
  ["#e5ecdc", "#c9d6b8", "#476436"],
  ["#f3e4dc", "#e2c3b4", "#8a3b22"],
  ["#ece7f1", "#d4cae0", "#5b4a7a"],
  ["#f1ece3", "#ddd2c0", "#3a3a3f"],
];

/** A soft studio-style picture: gradient backdrop, an arch, a shape standing in for the object. */
async function picture(seed: number, shape: string, label: string) {
  const [bg, mid, accent] = PALETTES[seed % PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${mid}"/></linearGradient>
    <radialGradient id="l" cx=".5" cy=".35" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <filter id="s" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="30" stdDeviation="30" flood-color="#000" flood-opacity=".18"/></filter>
  </defs>
  <rect width="1200" height="1500" fill="url(#g)"/>
  <path d="M600 180c-210 0-380 170-380 380v760h760V560c0-210-170-380-380-380Z" fill="#fff" fill-opacity=".28"/>
  <rect width="1200" height="1500" fill="url(#l)"/>
  <ellipse cx="600" cy="1190" rx="300" ry="34" fill="#000" fill-opacity=".08"/>
  <g filter="url(#s)" fill="${accent}">${shape}</g>
  <text x="600" y="1400" text-anchor="middle" font-family="Georgia, serif" font-size="44" fill="${accent}" fill-opacity=".55" letter-spacing="6">${label.toUpperCase()}</text>
</svg>`;
  const buf = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const tiny = await sharp(buf.data).resize(16).webp({ quality: 40 }).toBuffer();
  return prisma.media.create({
    data: { mime: "image/webp", width: buf.info.width, height: buf.info.height, bytes: new Uint8Array(buf.data), blur: `data:image/webp;base64,${tiny.toString("base64")}` },
  });
}

const SHAPES = {
  lamp: `<path d="M470 520h260l70 260H400Z"/><rect x="585" y="780" width="30" height="330"/><rect x="480" y="1100" width="240" height="40" rx="20"/>`,
  bottle: `<rect x="530" y="420" width="140" height="120" rx="20"/><rect x="460" y="540" width="280" height="580" rx="70"/>`,
  glass: `<path d="M420 560h150l-20 540h-110Z"/><path d="M630 560h150l-20 540h-110Z"/>`,
  watch: `<rect x="545" y="380" width="110" height="760" rx="40" fill-opacity=".55"/><circle cx="600" cy="760" r="190"/><circle cx="600" cy="760" r="150" fill="#fff" fill-opacity=".85"/><path d="M600 760V650M600 760l70 40" stroke="#333" stroke-width="12" stroke-linecap="round"/>`,
  bag: `<path d="M430 640h340l40 480H390Z"/><path d="M500 640c0-120 200-120 200 0" fill="none" stroke="currentColor" stroke-width="26"/>`,
  buds: `<rect x="430" y="760" width="340" height="300" rx="140"/><circle cx="520" cy="700" r="70"/><circle cx="680" cy="700" r="70"/>`,
  mirror: `<path d="M600 380c-150 0-260 110-260 260v400h520V640c0-150-110-260-260-260Z"/><path d="M600 440c-115 0-200 85-200 200v360h400V640c0-115-85-200-200-200Z" fill="#fff" fill-opacity=".7"/><rect x="420" y="1040" width="360" height="70" rx="20"/>`,
  rug: `<rect x="360" y="460" width="480" height="680" rx="14"/><path d="M600 520l180 280-180 280-180-280Z" fill="#fff" fill-opacity=".35"/><path d="M600 640l90 160-90 160-90-160Z" fill="#fff" fill-opacity=".5"/>`,
  blender: `<rect x="500" y="420" width="200" height="520" rx="40" fill-opacity=".6"/><rect x="480" y="940" width="240" height="180" rx="30"/>`,
  box: `<rect x="400" y="620" width="400" height="480" rx="30"/><rect x="380" y="560" width="440" height="90" rx="20"/>`,
  brush: `<rect x="560" y="420" width="80" height="420" rx="40"/><rect x="540" y="830" width="120" height="300" rx="40" fill-opacity=".7"/>`,
  throw: `<path d="M380 560h440v520c-60 40-160 40-220 0-60 40-160 40-220 0Z"/><path d="M380 680h440M380 800h440M380 920h440" stroke="#fff" stroke-opacity=".35" stroke-width="18"/>`,
};

type Demo = {
  slug: string; name: string; nameAr: string; cat: string; price: number; compareAt?: number; cost: number; shape: keyof typeof SHAPES;
  description: string; featured?: boolean; tracked?: number; variants?: { name: string; price?: number; stock?: number }[];
};

const CATS = [
  { slug: "maison", name: "Maison", nameAr: "الدار", shape: "lamp" as const },
  { slug: "beaute", name: "Beauté", nameAr: "الجمال", shape: "bottle" as const },
  { slug: "accessoires", name: "Accessoires", nameAr: "إكسسوارات", shape: "bag" as const },
  { slug: "cuisine", name: "Cuisine", nameAr: "الكوجينة", shape: "glass" as const },
  { slug: "high-tech", name: "High-tech", nameAr: "تكنولوجيا", shape: "buds" as const },
];

const PRODUCTS: Demo[] = [
  { slug: "lampe-de-chevet-tactile", name: "Lampe de chevet tactile", nameAr: "لمبة سرير باللمس", cat: "maison", price: 59_900, cost: 27_000, shape: "lamp", featured: true,
    description: "Trois intensités d'un simple toucher sur le pied. Lumière chaude, douce pour les yeux le soir.\n\nHauteur 32 cm. Câble USB-C fourni.", variants: [{ name: "Blanc" }, { name: "Noir" }, { name: "Bois" }] },
  { slug: "diffuseur-huiles-essentielles", name: "Diffuseur d'huiles essentielles", nameAr: "موزّع زيوت عطرية", cat: "maison", price: 69_000, compareAt: 79_000, cost: 31_000, shape: "bottle", featured: true,
    description: "Brume fine et silencieuse, 300 ml d'autonomie, arrêt automatique quand le réservoir est vide. Sept couleurs de veilleuse." },
  { slug: "set-6-verres-ambres", name: "Set de 6 verres ambrés", nameAr: "طقم 6 كيسان عنبري", cat: "cuisine", price: 45_500, cost: 19_000, shape: "glass", tracked: 14,
    description: "Verre épais teinté ambre, 300 ml. Passe au lave-vaisselle." },
  { slug: "brosse-soufflante-3-en-1", name: "Brosse soufflante 3 en 1", nameAr: "فرشاة سشوار 3 في 1", cat: "beaute", price: 89_000, cost: 42_000, shape: "brush", featured: true,
    description: "Sèche, lisse et donne du volume en un seul geste. Trois températures, embout froid pour fixer." },
  { slug: "montre-minimaliste", name: "Montre minimaliste", nameAr: "ساعة بسيطة", cat: "accessoires", price: 79_000, cost: 33_000, shape: "watch",
    description: "Boîtier 38 mm en acier, bracelet maille milanaise réglable. Étanche aux éclaboussures.", variants: [{ name: "Argent" }, { name: "Doré", price: 85_000 }, { name: "Noir" }] },
  { slug: "sac-bandouliere-cuir-vegan", name: "Sac bandoulière en cuir végan", nameAr: "صاك كتف جلد نباتي", cat: "accessoires", price: 65_000, cost: 28_000, shape: "bag", featured: true,
    description: "Format compact qui contient téléphone, portefeuille et clés. Bandoulière réglable et amovible.", variants: [{ name: "Camel" }, { name: "Noir" }, { name: "Crème" }] },
  { slug: "ecouteurs-sans-fil", name: "Écouteurs sans fil", nameAr: "سماعات بلا خيط", cat: "high-tech", price: 99_000, cost: 46_000, shape: "buds",
    description: "Bluetooth 5.3, jusqu'à 6 h d'écoute et 24 h avec le boîtier. Commandes tactiles." },
  { slug: "miroir-led-maquillage", name: "Miroir LED de maquillage", nameAr: "مراية LED للماكياج", cat: "beaute", price: 75_000, cost: 34_000, shape: "mirror",
    description: "Éclairage réglable en trois teintes, rechargeable. Pied orientable." },
  { slug: "tapis-berbere-120x170", name: "Tapis berbère 120 × 170", nameAr: "زربية بربرية 120 × 170", cat: "maison", price: 189_000, compareAt: 220_000, cost: 95_000, shape: "rug",
    description: "Motif losange, poils courts faciles à entretenir. Dos antidérapant." },
  { slug: "mixeur-portable", name: "Mixeur portable", nameAr: "خلاط محمول", cat: "cuisine", price: 49_900, cost: 21_000, shape: "blender", tracked: 4,
    description: "Smoothies et jus en 30 secondes. Rechargeable en USB, gobelet 400 ml." },
  { slug: "organisateur-maquillage-rotatif", name: "Organisateur de maquillage rotatif", nameAr: "منظّم ماكياج دوّار", cat: "beaute", price: 39_900, cost: 15_000, shape: "box",
    description: "Tourne à 360°, plateaux réglables. Range pinceaux, rouges à lèvres et soins." },
  { slug: "plaid-tricot", name: "Plaid en grosse maille", nameAr: "غطاء تريكو", cat: "maison", price: 85_000, cost: 38_000, shape: "throw",
    description: "130 × 160 cm, tricot épais et doux. Lavable à 30 °C.", variants: [{ name: "Écru" }, { name: "Terracotta" }, { name: "Gris" }] },
];

async function main() {
  const existing = await prisma.product.count({ where: { isDemo: true } });
  if (existing > 0) {
    console.log("Demo catalogue already there.");
    return;
  }
  const cats = new Map<string, string>();
  for (const [i, c] of CATS.entries()) {
    const img = await picture(i, SHAPES[c.shape], c.name);
    const row = await prisma.category.upsert({ where: { slug: c.slug }, create: { slug: c.slug, name: c.name, nameAr: c.nameAr, sort: i, imageId: img.id }, update: {} });
    cats.set(c.slug, row.id);
  }
  for (const [i, p] of PRODUCTS.entries()) {
    const imgs = [await picture(i, SHAPES[p.shape], p.name.split(" ")[0]), await picture(i + 2, SHAPES[p.shape], p.name.split(" ")[0])];
    await prisma.product.create({
      data: {
        slug: p.slug, name: p.name, nameAr: p.nameAr, description: p.description, price: p.price, compareAt: p.compareAt ?? null, cost: p.cost,
        categoryId: cats.get(p.cat), active: true, featured: Boolean(p.featured), isDemo: true,
        stockMode: p.tracked != null ? "TRACKED" : "SUPPLIER", stockQty: p.tracked ?? 0, available: true,
        images: { create: imgs.map((m, n) => ({ mediaId: m.id, sort: n })) },
        variants: p.variants ? { create: p.variants.map((v, n) => ({ name: v.name, price: v.price ?? null, stockQty: v.stock ?? 0, available: true, sort: n })) } : undefined,
      },
    });
  }
  console.log(`Demo catalogue: ${CATS.length} categories, ${PRODUCTS.length} products.`);
}

main().finally(() => prisma.$disconnect());
