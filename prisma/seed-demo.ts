/**
 * A demo catalogue so the shop can be seen before the real products are in.
 * Every row is marked isDemo; Back office → Produits → "Supprimer la démo"
 * removes them all. No reviews, no orders, no sales are invented. Running it
 * again on an older demo brings it up to date (texts, pictures) without
 * touching anything the shop wrote.
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
  { slug: "maison", name: "Maison", nameAr: "الدار", headline: "Pour une maison douce", headlineAr: "لدار مريحة", shape: "lamp" as const },
  { slug: "beaute", name: "Beauté", nameAr: "الجمال", headline: "Prendre soin de soi", headlineAr: "اعتني بروحك", shape: "bottle" as const },
  { slug: "accessoires", name: "Accessoires", nameAr: "إكسسوارات", headline: "Les petits plus", headlineAr: "تفاصيل تفرق", shape: "bag" as const },
  { slug: "cuisine", name: "Cuisine", nameAr: "الكوجينة", headline: "Tout pour la cuisine", headlineAr: "كل شي للكوجينة", shape: "glass" as const },
  { slug: "high-tech", name: "High-tech", nameAr: "تكنولوجيا", headline: "Écouter, recharger", headlineAr: "اسمع واشحن", shape: "buds" as const },
];

/** Demo offers: one unit, two, and "2 + 1" with delivery included, at real totals. */
function demoOffers(price: number) {
  const round = (m: number) => Math.round(m / 1000) * 1000 - 100;
  return [
    { label: "1 unité", labelAr: "حبة وحدة", quantity: 1, price, freeDelivery: false, sort: 0 },
    { label: "2 unités", labelAr: "زوز حبات", quantity: 2, price: round(price * 2 * 0.9), freeDelivery: false, sort: 1 },
    { label: "Achetez 2, la 3e offerte", labelAr: "اشري 2 والثالثة هدية", quantity: 3, price: price * 2, freeDelivery: true, sort: 2 },
  ];
}
/** The product page's texts for the demo: a line under the name, the Arabic description, the specs. */
const CONTENT: Record<string, { keywords: string; summary: string; summaryAr: string; descriptionAr: string; specs: string; specsAr: string }> = {
  "lampe-de-chevet-tactile": {
    keywords: "lampe, veilleuse, lampe de nuit, lampe tactile, lamba, lampa, ضو, لمبة, ضو سرير",
    summary: "Un toucher sur le pied pour allumer : trois intensités, une lumière chaude et douce pour lire le soir.",
    summaryAr: "تمسّ الساق تشعل: 3 درجات ضو، ضو دافي ومريح للقراية في الليل.",
    descriptionAr: "تمسّة وحدة على الساق وتختار قدّاش تحب الضو: خفيف، متوسّط ولا قوي. الضو دافي وما يتعبش العينين.\n\nطولها 32 صم. الكابل USB-C معاها.",
    specs: "Hauteur : 32 cm\nLumière : chaude, 3 intensités\nAlimentation : câble USB-C (fourni)\nDans la boîte : 1 lampe, 1 câble",
    specsAr: "الطول: 32 صم\nالضو: دافي، 3 درجات\nالشحن: كابل USB-C (معاها)\nفي الكرطونة: لمبة وكابل",
  },
  "diffuseur-huiles-essentielles": {
    keywords: "diffuseur, humidificateur, parfum maison, huile essentielle, brumisateur, difuseur, مبخرة, معطر, بخار",
    summary: "Une brume fine et silencieuse qui parfume la pièce, avec sept couleurs de veilleuse. S'arrête seul quand il est vide.",
    summaryAr: "بخار رقيق وبلا حس يعطّر البيت، و7 ألوان ضو. يطفى وحدو كي يفرغ الماء.",
    descriptionAr: "حطّ شوية ماء وقطرات من الزيت اللي تحبّو، وهو يعمل بخار رقيق يعطّر البيت بلا حس.\n\nخزّان 300 مل. يطفى وحدو كي يفرغ. 7 ألوان ضو تنجم تخليها ولا تطفيها.",
    specs: "Réservoir : 300 ml\nArrêt automatique : oui, quand le réservoir est vide\nVeilleuse : 7 couleurs\nBruit : très faible\nDans la boîte : 1 diffuseur, 1 câble, 1 gobelet doseur",
    specsAr: "الخزّان: 300 مل\nيطفى وحدو: إيه، كي يفرغ الماء\nالضو: 7 ألوان\nالحس: خفيف برشا\nفي الكرطونة: الموزّع، كابل، كاس قياس",
  },
  "set-6-verres-ambres": {
    keywords: "verres, verre, gobelets, kes, kisen, كيسان, كاس, بلار",
    summary: "Six verres épais teintés ambre, 300 ml, qui passent au lave-vaisselle.",
    summaryAr: "6 كيسان بلّار خشين لون عنبري، 300 مل، يتغسلو في الماكينة.",
    descriptionAr: "بلّار خشين ولونو عنبري يعطي حس للطاولة. كل كاس 300 مل.\n\nيتغسلو في ماكينة الماعون بلا مشكل.",
    specs: "Contenance : 300 ml par verre\nMatière : verre épais teinté\nLave-vaisselle : oui\nDans la boîte : 6 verres",
    specsAr: "السعة: 300 مل للكاس\nالمادة: بلّار خشين ملوّن\nماكينة الماعون: إيه\nفي الكرطونة: 6 كيسان",
  },
  "brosse-soufflante-3-en-1": {
    keywords: "brosse soufflante, sèche-cheveux, seche cheveux, lisseur, brushing, sechouar, سشوار, فرشاة شعر",
    summary: "Sèche, lisse et donne du volume en un seul geste, avec trois températures.",
    summaryAr: "تنشّف، تملّس وتعطي حجم في نفس الوقت، بـ 3 درجات سخانة.",
    descriptionAr: "فرشاة وسشوار في وقت واحد: تنشّف الشعر وتملّسو وتعطيه حجم.\n\n3 درجات سخانة وزر بارد باش تثبّت التسريحة.",
    specs: "Températures : 3, et air froid\nUsage : sécher, lisser, donner du volume\nCâble : rotatif",
    specsAr: "السخانة: 3 درجات وهواء بارد\nتنشّف، تملّس، تعطي حجم\nالكابل: يدور",
  },
  "montre-minimaliste": {
    keywords: "montre, montre femme, montre homme, sa3a, ساعة, مونتر",
    summary: "Boîtier fin de 38 mm et bracelet en maille milanaise réglable.",
    summaryAr: "ساعة رقيقة 38 مم، بسوار حديد مضفور يتعدّل.",
    descriptionAr: "ساعة بسيطة وأنيقة، تمشي مع كل لبسة. السوار يتعدّل على قدّ يدّك.\n\nما يضرّهاش رشّ الماء.",
    specs: "Boîtier : 38 mm, acier\nBracelet : maille milanaise réglable\nÉtanchéité : aux éclaboussures",
    specsAr: "الساعة: 38 مم، حديد\nالسوار: مضفور ويتعدّل\nالماء: ما يضرّهاش الرش",
  },
  "sac-bandouliere-cuir-vegan": {
    keywords: "sac, sac à main, sacoche, bandoulière, sak, صاك, ساك",
    summary: "Petit sac qui garde l'essentiel : téléphone, portefeuille, clés. Bandoulière réglable.",
    summaryAr: "صاك صغير يهز الأساسي: التليفون، البزطام والمفاتح. الحزام يتعدّل.",
    descriptionAr: "صاك خفيف يهز التليفون والبزطام والمفاتح. الحزام يتعدّل ويتنحّى.",
    specs: "Matière : cuir végan\nBandoulière : réglable et amovible",
    specsAr: "المادة: جلد نباتي\nالحزام: يتعدّل ويتنحّى",
  },
  "ecouteurs-sans-fil": {
    keywords: "écouteurs, ecouteur, airpods, bluetooth, kit, casque, سماعات, ايربودز",
    summary: "Bluetooth 5.3, six heures d'écoute et vingt-quatre heures avec le boîtier.",
    summaryAr: "بلوتوث 5.3، 6 سوايع سماع و24 ساعة بالعلبة متاعهم.",
    descriptionAr: "سماعات بلا خيط، تتربط بالتليفون في ثانية. 6 سوايع سماع، و24 ساعة كي تشحنهم في العلبة.\n\nتمسّة على السماعة تحبّس ولا تبدّل الأغنية.",
    specs: "Bluetooth : 5.3\nAutonomie : 6 h (24 h avec le boîtier)\nCommandes : tactiles",
    specsAr: "البلوتوث: 5.3\nالشحن: 6 سوايع (24 بالعلبة)\nالتحكّم: باللمس",
  },
  "miroir-led-maquillage": {
    keywords: "miroir, miroir lumineux, maquillage, mraya, mirwar, مراية, مرايه",
    summary: "Lumière réglable en trois teintes, rechargeable, pied orientable.",
    summaryAr: "ضو يتعدّل في 3 ألوان، يتشحن، والساق تدور.",
    descriptionAr: "مراية بضو LED تتعدّل: أبيض، دافي ولا بيناتهم. تتشحن وما تحتاجش كابل ديما.",
    specs: "Lumière : LED, 3 teintes\nAlimentation : rechargeable\nPied : orientable",
    specsAr: "الضو: LED، 3 ألوان\nالشحن: يتشحن\nالساق: تدور",
  },
  "tapis-berbere-120x170": {
    keywords: "tapis, zarbia, zarbiya, berbère, زربية, سجاد",
    summary: "Motif losange, poils courts faciles à entretenir, dos antidérapant.",
    summaryAr: "نقشة معيّنات، صوف قصير ساهل في التنظيف، وما يزلقش.",
    descriptionAr: "زربية بنقشة بربرية تعطي دفء للبيت. الصوف قصير وساهل في التنظيف، والظهر ما يزلقش.",
    specs: "Dimensions : 120 × 170 cm\nPoils : courts\nDos : antidérapant",
    specsAr: "القياس: 120 × 170 صم\nالصوف: قصير\nالظهر: ما يزلقش",
  },
  "mixeur-portable": {
    keywords: "mixeur, blender, jus, smoothie, mixer, خلاط, ميكسور",
    summary: "Smoothies et jus en trente secondes, rechargeable en USB.",
    summaryAr: "عصير وسموذي في 30 ثانية، يتشحن بـ USB.",
    descriptionAr: "خلاط صغير تهزّو معاك: عصير ولا سموذي في 30 ثانية. يتشحن بـ USB.",
    specs: "Gobelet : 400 ml\nAlimentation : rechargeable USB",
    specsAr: "الكاس: 400 مل\nالشحن: USB",
  },
  "organisateur-maquillage-rotatif": {
    keywords: "organisateur, rangement, maquillage, boîte, منظم, رفوف",
    summary: "Tourne sur lui-même, plateaux réglables : tout se range et se trouve vite.",
    summaryAr: "يدور على روحو والرفوف تتعدّل: كل شي يتنظّم ويتلقى بالزربة.",
    descriptionAr: "منظّم يدور 360 درجة، والرفوف تتعدّل على قدّ الحوايج متاعك: فرشات، روج، كريمات.",
    specs: "Rotation : 360°\nPlateaux : réglables",
    specsAr: "يدور: 360 درجة\nالرفوف: تتعدّل",
  },
  "plaid-tricot": {
    keywords: "plaid, couverture, jeté, tricot, ghta, غطاء, كوفرطة",
    summary: "Grosse maille douce, 130 × 160 cm, lavable à 30 °C.",
    summaryAr: "تريكو خشين وناعم، 130 × 160 صم، يتغسل على 30 درجة.",
    descriptionAr: "غطاء تريكو خشين وناعم، يدفّيك على الكنابة ولا في الفرش. يتغسل في الماكينة على 30 درجة.",
    specs: "Dimensions : 130 × 160 cm\nLavage : 30 °C",
    specsAr: "القياس: 130 × 160 صم\nالغسيل: 30 درجة",
  },
};

/** Option names in Arabic, for the demo's options. */
const OPTION_AR: Record<string, string> = { Blanc: "أبيض", Noir: "أكحل", Bois: "خشب", Argent: "فضّي", Doré: "ذهبي", Camel: "كاميل", Crème: "كريمي", Écru: "بيج فاتح", Terracotta: "طوبي", Gris: "رمادي" };

/** A long description picture, Amazon-style: a headline and three points with their icons. */
async function longPicture(seed: number, title: string, points: string[]) {
  const [bg, mid, accent] = PALETTES[seed % PALETTES.length];
  const rows = points
    .map(
      (p, i) => `<g transform="translate(0 ${560 + i * 380})">
    <rect x="90" y="0" width="1020" height="320" rx="40" fill="#fff" fill-opacity=".8"/>
    <circle cx="250" cy="160" r="96" fill="${accent}"/>
    <text x="250" y="190" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="90" fill="#fff">${i + 1}</text>
    <text x="400" y="185" font-family="DejaVu Sans" font-weight="bold" font-size="58" fill="#1c2633">${p}</text>
  </g>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${mid}"/></linearGradient></defs>
  <rect width="1200" height="1800" fill="url(#g)"/>
  <text x="600" y="300" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="84" fill="${accent}">${title}</text>
  <rect x="480" y="360" width="240" height="12" rx="6" fill="${accent}" fill-opacity=".5"/>
  ${rows}
</svg>`;
  const buf = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const tiny = await sharp(buf.data).resize(16).webp({ quality: 40 }).toBuffer();
  return prisma.media.create({
    data: { mime: "image/webp", width: buf.info.width, height: buf.info.height, bytes: new Uint8Array(buf.data), blur: `data:image/webp;base64,${tiny.toString("base64")}` },
  });
}

/** Two demo products get a full set: more pictures and long description pictures. */
const RICH: Record<string, { extra: number; long: { title: string; points: string[] }[] }> = {
  "diffuseur-huiles-essentielles": {
    extra: 3,
    long: [
      { title: "Silencieux et sûr", points: ["Brume fine, sans bruit", "Arrêt quand il est vide", "300 ml : toute la nuit"] },
      { title: "Comment l'utiliser", points: ["Remplir d'eau", "3 à 5 gouttes d'huile", "Appuyer, c'est parti"] },
    ],
  },
  "lampe-de-chevet-tactile": {
    extra: 2,
    long: [{ title: "Un toucher suffit", points: ["Faible pour la nuit", "Moyen pour se détendre", "Fort pour lire"] }],
  },
};

const WITH_OFFERS = new Set(["diffuseur-huiles-essentielles", "set-6-verres-ambres", "brosse-soufflante-3-en-1", "lampe-de-chevet-tactile"]);

/** Brings an older demo catalogue up to date (offers, card titles). Safe to run again. */
async function upgrade() {
  for (const c of CATS) await prisma.category.updateMany({ where: { slug: c.slug, headline: null }, data: { headline: c.headline, headlineAr: c.headlineAr } });
  for (const p of PRODUCTS) {
    if (!WITH_OFFERS.has(p.slug)) continue;
    const row = await prisma.product.findFirst({ where: { slug: p.slug, isDemo: true }, select: { id: true, price: true, _count: { select: { offers: true } } } });
    if (row && row._count.offers === 0) await prisma.productOffer.createMany({ data: demoOffers(row.price).map((o) => ({ ...o, productId: row.id })) });
  }
  // Texts for the new product page, only where the shop has not written its own.
  for (const [slug, c] of Object.entries(CONTENT)) {
    await prisma.product.updateMany({ where: { slug, isDemo: true, summary: "" }, data: c });
    await prisma.product.updateMany({ where: { slug, isDemo: true, keywords: "" }, data: { keywords: c.keywords } });
  }
  for (const [name, nameAr] of Object.entries(OPTION_AR)) {
    await prisma.productVariant.updateMany({ where: { name, nameAr: null, product: { isDemo: true } }, data: { nameAr } });
  }
  for (const [i, p] of PRODUCTS.entries()) await richImages(p, i);
}

async function richImages(p: Demo, i: number) {
  const rich = RICH[p.slug];
  if (!rich) return;
  const row = await prisma.product.findFirst({ where: { slug: p.slug, isDemo: true }, select: { id: true, images: { select: { kind: true } } } });
  if (!row || row.images.some((x) => x.kind === "DETAIL")) return;
  const label = p.name.split(" ")[0];
  let sort = row.images.length;
  for (let n = 0; n < rich.extra; n++) {
    const m = await picture(i + 3 + n, SHAPES[p.shape], label);
    await prisma.productImage.create({ data: { productId: row.id, mediaId: m.id, sort: sort++ } });
  }
  for (const [n, l] of rich.long.entries()) {
    const m = await longPicture(i + n, l.title, l.points);
    await prisma.productImage.create({ data: { productId: row.id, mediaId: m.id, sort: n, kind: "DETAIL" } });
  }
}

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
    await upgrade();
    console.log("Demo catalogue already there (brought up to date).");
    return;
  }
  const cats = new Map<string, string>();
  for (const [i, c] of CATS.entries()) {
    const img = await picture(i, SHAPES[c.shape], c.name);
    const row = await prisma.category.upsert({ where: { slug: c.slug }, create: { slug: c.slug, name: c.name, nameAr: c.nameAr, headline: c.headline, headlineAr: c.headlineAr, sort: i, imageId: img.id }, update: {} });
    cats.set(c.slug, row.id);
  }
  for (const [i, p] of PRODUCTS.entries()) {
    const imgs = [await picture(i, SHAPES[p.shape], p.name.split(" ")[0]), await picture(i + 2, SHAPES[p.shape], p.name.split(" ")[0])];
    await prisma.product.create({
      data: {
        slug: p.slug, name: p.name, nameAr: p.nameAr, description: p.description, ...CONTENT[p.slug], price: p.price, compareAt: p.compareAt ?? null, cost: p.cost,
        categoryId: cats.get(p.cat), active: true, featured: Boolean(p.featured), isDemo: true,
        stockMode: p.tracked != null ? "TRACKED" : "SUPPLIER", stockQty: p.tracked ?? 0, available: true,
        images: { create: imgs.map((m, n) => ({ mediaId: m.id, sort: n })) },
        variants: p.variants ? { create: p.variants.map((v, n) => ({ name: v.name, nameAr: OPTION_AR[v.name] ?? null, price: v.price ?? null, stockQty: v.stock ?? 0, available: true, sort: n })) } : undefined,
        offers: WITH_OFFERS.has(p.slug) ? { create: demoOffers(p.price) } : undefined,
      },
    });
  }
  for (const [i, p] of PRODUCTS.entries()) await richImages(p, i);
  console.log(`Demo catalogue: ${CATS.length} categories, ${PRODUCTS.length} products.`);
}

main().finally(() => prisma.$disconnect());
