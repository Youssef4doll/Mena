import { test } from "node:test";
import assert from "node:assert/strict";
import { labelAdds, labelFits, offerLabelProblem, offerLine, offerNote, unitsInLabel } from "./offer-label";

test("the number of units a name speaks of", () => {
  assert.equal(unitsInLabel("Achetez 2, la 3e offerte"), 3);
  assert.equal(unitsInLabel("2 + 1 offerte"), 3);
  assert.equal(unitsInLabel("اشري 2 والثالثة هدية"), 3);
  assert.equal(unitsInLabel("الثانية"), 2);
  assert.equal(unitsInLabel("زوز حبات"), 2);
  assert.equal(unitsInLabel("حبة وحدة"), 1);
  assert.equal(unitsInLabel("Lot de deux"), 2);
  assert.equal(unitsInLabel("٣ حبات"), 3);
  // Prices, percentages and measures are not counts.
  assert.equal(unitsInLabel("-20 % sur le lot"), null);
  assert.equal(unitsInLabel("2 pour 80,000 DT"), 2);
  assert.equal(unitsInLabel("Pack 500 ml"), null);
  assert.equal(unitsInLabel("Offre duo"), null);
});

test("a name fits its offer only when it speaks of the same quantity", () => {
  assert.equal(labelFits("Achetez 2, la 3e offerte", 2), false);
  assert.equal(labelFits("Achetez 2, la 3e offerte", 3), true);
  assert.equal(labelFits("الثانية", 3), false);
  assert.equal(labelFits("Offre duo", 2), true);
  assert.equal(labelFits("", 2), true);
});

test("a name is shown under the quantity only when it says more than a number", () => {
  assert.equal(labelAdds("الثانية"), false);
  assert.equal(labelAdds("حبة وحدة"), false);
  assert.equal(labelAdds("2 unités"), false);
  assert.equal(labelAdds("Lot de 2"), false);
  assert.equal(labelAdds("Achetez 2, la 3e offerte"), true);
  assert.equal(labelAdds("اشري 2 والثالثة هدية"), true);
});

test("the title is the quantity; the owner's name follows when it is true and useful", () => {
  const maxisalon = { quantity: 2, label: "Achetez 2, la 3e offerte", labelAr: "الثانية" };
  assert.equal(offerLine(maxisalon, "fr"), "2 unités");
  assert.equal(offerLine(maxisalon, "ar"), "زوز حبات");
  const pack = { quantity: 3, label: "Achetez 2, la 3e offerte", labelAr: "اشري 2 والثالثة هدية" };
  assert.equal(offerLine(pack, "fr"), "3 unités · Achetez 2, la 3e offerte");
  assert.equal(offerLine(pack, "ar"), "3 حبات · اشري 2 والثالثة هدية");
  // A French name is not shown on the Arabic page.
  assert.equal(offerNote({ quantity: 3, label: "Achetez 2, la 3e offerte", labelAr: null }, "ar"), null);
  assert.equal(offerLine({ quantity: 1, label: "1 unité", labelAr: "واحدة" }, "ar"), "حبة وحدة");
});

test("the editor names the offer that contradicts itself", () => {
  assert.match(offerLabelProblem({ quantity: 2, label: "Achetez 2, la 3e offerte", labelAr: null })!, /annonce 3 unités, mais la quantité est 2/);
  assert.equal(offerLabelProblem({ quantity: 3, label: "Achetez 2, la 3e offerte", labelAr: "اشري 2 والثالثة هدية" }), null);
});
