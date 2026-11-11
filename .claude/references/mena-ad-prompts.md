# Mena ad prompts (the owner's style, 11 November 2026)

Two steps for every feed picture. The owner wrote these prompts, so keep their wording. Fill only the [brackets], and only with the shop's real facts.

## The look the owner chose (11 November)

`mena-ad-example.jpg` in this folder is the model: attach it (`https://raw.githubusercontent.com/Youssef4doll/Mena/main/.claude/references/mena-ad-example.jpg`, uploaded to Canva) as a style reference in step 2, and match it.

- Step 1 is **product only** (concept B): the whole set shown, every part the customer gets (bag, boxes, cutlery), on a ribbed travertine podium or a light stone surface, warm beige tonal background, softly blurred kitchen or room, no person.
- Logo top centre; the product name is **the shop's full product name** (2 lines); the new price in a pill filled with a light colour taken from the product (cream, beige), the old price in a black pill with a strikethrough, touching.
- One round badge, tilted, in a warm tan colour, on the right side above the product: "OFFRE SPÉCIALE" when the product has a real old price; the real pack ("2 POUR 95 DT") when it has a pack and no old price; no badge otherwise.
- No other text: no "Paiement à la livraison" line on the picture (it goes in the caption).

## Step 1: the photo (send it with the product's own photos as references)

```
You are a professional commercial photographer. Study the attached product photos carefully and identify the product: its exact shape, proportions, colors, materials, finish (glossy/matte/metal), logo, lettering and every visible detail. Reproduce it EXACTLY, do not redesign, simplify or reinvent anything.

Create a professional e-commerce advertising photo for Instagram, vertical 4:5 (1080x1350), in the style of a high-end graphic designer's campaign.

CONCEPT: [choose one]
A) LIFESTYLE: a [woman/man, age, hair/look] naturally [using / wearing / holding] the product in a way that shows the problem it solves or the result it gives. Natural, confident, relaxed expression. The product's branded side faces the camera and is clearly visible, with correct hand anatomy.
B) PRODUCT ONLY: the product beautifully styled on [podium / glossy surface / marble counter / bed / shelf] with 2-3 subtle props that match its theme.

BACKGROUND: a simple, softly blurred [room type] in tonal colors that complement the product. If the product is dark, use a light background; if it is light, use a slightly deeper tone. No clutter.

COMPOSITION (strict):
- The subject and product occupy ONLY the bottom 60% of the frame. The top of the head must sit at about 35-40% from the top.
- The top 30% of the image is EMPTY background (clean wall or soft blur), no head, hair, objects or lights there.
- The left 35% of the frame, in the middle area, is also kept clean, with the subject placed slightly to the right.
- Product sharp and in focus, shallow depth of field.

LIGHTING: soft, warm natural light, gentle highlights, soft shadows, premium but fresh feel.

STYLE: ultra-realistic commercial photography, realistic skin and materials, sharp details.

NO text, NO extra logos, NO watermark, NO price, NO borders. The only lettering allowed is the product's own branding as shown in the reference.
```

When a first try changes the product, add one sentence after the first paragraph that describes the real product exactly (shape, colours, parts, label), then generate again.

## Step 2: the ad (send it with the step 1 photo and the store logo as references)

```
Act as a professional social media graphic designer. Turn the attached photo into a finished Instagram ad post (vertical 4:5, 1080x1350) in the style of a clean, modern e-commerce brand campaign.

KEEP THE PHOTO: Do not change the product, the person, or the lighting. You may extend, recolor, or soften the background only so the text and design elements fit naturally. Keep the product 100% accurate and fully visible, and never let text cover it or the person's face.

CONTENT (use this text exactly, spelled exactly like this, in [language]):
- Store logo: [attached logo / store name], top center, small and clean
- Brand logo: [attached brand logo], upper left, under the store logo
- Product name: "[product name, max 6 words]"
- Price: "[new price]" with old price "[old price]" crossed out
- Deal / highlight: "[e.g. -30% / 2 achetés = 1 offert / Livraison gratuite / New]"
- Optional badge: "[e.g. Promo / Nouveau / Best-seller / Offre spéciale]"

LAYOUT:
1. TOP CENTER: store logo, small, in white or black depending on the background, with plenty of breathing room.
2. UPPER LEFT: brand logo, then the product name below it in a clean modern sans-serif (Poppins style), regular weight, 2 lines max, left-aligned.
3. BELOW THE NAME: a price pill. The new price sits in a rounded pill with a solid light fill (white or the brand's accent color) and bold dark text. Right next to it, a second black rounded pill holds the old price in white with a strikethrough. Both pills are the same height and touch each other.
4. ONE BADGE only: a small round sticker or a speech-bubble shape in an accent color taken from the product or background, with 2-3 short words, placed on a free side area, slightly tilted. It must not overlap the product or face.
5. Optional tiny detail at the bottom center: carousel dots, to give the Instagram carousel look.
6. The product and person stay as the hero in the lower 60%. Text occupies only the upper-left and top areas.

BACKGROUND ADJUSTMENT: Extend and soften the background where the text sits so it is calm and low-contrast, with no busy details behind the text. Use a subtle gradient, light rays, or blur in tonal colors that match the product. If needed, add 1-2 very subtle props or shapes that fit the product theme (soft glow, petals, reflections). Keep it simple.

TYPOGRAPHY RULES: Maximum 2 fonts (one bold condensed or geometric sans for the store name/price, one clean sans for details). High contrast and readable on mobile. Consistent left alignment. Generous spacing. Maximum 5 text elements in total.

STYLE: minimal, premium, uncluttered, like a real designer's work. No stock-style stickers, no clip art, no gradients on the text, no drop shadows, no frames or borders, no extra text that I did not provide.

STRICT RULES:
- Use ONLY the text and logos I list in CONTENT. Do not invent, add, translate or change any text, brand name or logo.
- NO badge, sticker or "Promo" label unless it is listed in CONTENT.
- NO carousel dots, arrows, buttons, UI elements or Instagram interface.
- If a brand logo is not provided, leave that space empty. Do not create one.
- Total text elements: only those listed in CONTENT, nothing else.

EXACT LOGO PLACEMENT (canvas 1080x1350):
- Store logo: width = 24% of the canvas width (about 260px), height proportional, never stretched or distorted.
- Horizontally centered: the logo's center sits exactly at the middle of the canvas (x = 540px). Equal empty space on its left and right.
- Vertical position: top edge at 4.5% from the top (about 60px).
- Keep a clear empty margin of at least 3% around the logo. Nothing overlaps it.
- Use the logo exactly as attached: same colors, same letters, same proportions. Do not redraw, add to, or restyle it.

EXACT TEXT BLOCK:
- Left margin: 8% of the canvas width (about 86px) for the product name and the price pills, all sharing the same left edge.
- Product name starts at about 18% from the top (about 245px), max width 60% of the canvas, 2 lines max, font size about 4% of the canvas height (about 54px).
- Price pill: height about 5% of the canvas height (about 68px), placed 3% (about 40px) below the product name, new price pill and old price pill the same height and touching.
- The product and scene stay in the lower 55-60% of the image.
```

The STRICT RULES win over LAYOUT 4 and 5: no badge and no carousel dots unless they are in CONTENT.

## Filling CONTENT truthfully

- Language: French on the picture (the owner's examples are French, and generated Arabic letters come out wrong). The caption stays in derja.
- Store logo: `https://menatn.vercel.app/brand/mena-logo.png` (dark) or `mena-logo-white.png` (white), uploaded to Canva with `upload-asset-from-url`. Generated from `src/components/shop/Logo.tsx`; never let the generator redraw it.
- Brand logo: only when the product carries a real brand the shop names (e.g. MAXISALON). Otherwise write "none, leave that space empty".
- Price: the shop's price as the shop writes it ("39,000 DT"). Old price only when the product has a real `ancien_prix` / compare-at price. Without one, write "no old price: show the new price pill only".
- Deal: only a real offer of the product ("2 pour 95 DT, livraison gratuite") or a real promise ("Paiement à la livraison").
- Badge: none, unless the shop really runs it. Never "Best-seller", "Promo", "-30 %" or "Nouveau" without the data behind it.
- After generating, check the picture letter by letter: the name, the prices, the logo. Any wrong letter, a redrawn logo, or a changed product means generate again or fix it in the Canva editor.
