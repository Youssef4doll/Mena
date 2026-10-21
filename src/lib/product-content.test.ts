import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSpecs, parseVideo, soldStep } from "./product-content";

test("specs are read one line at a time, label before the colon", () => {
  assert.deepEqual(parseSpecs("Matière : inox\n\n- Couleur: Noir\nPasse au lave-vaisselle\nDimensions : 32 × 20 cm"), [
    { label: "Matière", value: "inox" },
    { label: "Couleur", value: "Noir" },
    { label: "", value: "Passe au lave-vaisselle" },
    { label: "Dimensions", value: "32 × 20 cm" },
  ]);
  assert.deepEqual(parseSpecs("المادة: إينوكس"), [{ label: "المادة", value: "إينوكس" }]);
  assert.deepEqual(parseSpecs("Garantie :"), [{ label: "", value: "Garantie" }]);
  assert.deepEqual(parseSpecs(null), []);
});

test("YouTube, Vimeo, TikTok, Instagram, Facebook and direct video files are accepted, nothing else", () => {
  assert.deepEqual(parseVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3"), { kind: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(parseVideo("https://youtu.be/dQw4w9WgXcQ"), { kind: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(parseVideo("https://youtube.com/shorts/dQw4w9WgXcQ?feature=share"), { kind: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(parseVideo("https://cdn.example.com/v/clip.MP4"), { kind: "file", src: "https://cdn.example.com/v/clip.MP4" });
  assert.equal(parseVideo("http://cdn.example.com/clip.mp4"), null);
  assert.equal(parseVideo("https://www.youtube.com/watch?v=short"), null);
  assert.equal(parseVideo("https://example.com/page"), null);
  assert.equal(parseVideo("javascript:alert(1)"), null);
  assert.equal(parseVideo(""), null);
  assert.deepEqual(parseVideo("https://vimeo.com/76979871"), { kind: "embed", provider: "vimeo", src: "https://player.vimeo.com/video/76979871?autoplay=1&playsinline=1&title=0&byline=0", vertical: false });
  assert.equal(parseVideo("https://www.tiktok.com/@mena.tn/video/7301234567890123456?lang=fr")?.kind, "embed");
  assert.match((parseVideo("https://www.tiktok.com/@mena.tn/video/7301234567890123456") as { src: string }).src, /^https:\/\/www\.tiktok\.com\/player\/v1\/7301234567890123456\?/);
  assert.equal(parseVideo("https://vm.tiktok.com/ZMabcdef/"), null, "a short link hides the id");
  assert.equal((parseVideo("https://www.instagram.com/reel/C1a2b3c4d5e/?igsh=x") as { src: string }).src, "https://www.instagram.com/reel/C1a2b3c4d5e/embed");
  assert.equal((parseVideo("https://www.facebook.com/mena.tn/videos/1234567890123/") as { src: string }).src, `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent("https://www.facebook.com/watch/?v=1234567890123")}&show_text=false&autoplay=true`);
  assert.equal((parseVideo("https://www.facebook.com/reel/1234567890123") as { vertical: boolean }).vertical, true);
  assert.equal(parseVideo("https://fb.watch/abcDEF/"), null);
  assert.equal(parseVideo("https://www.facebook.com/mena.tn"), null);
  assert.deepEqual(parseVideo("https://abc.public.blob.vercel-storage.com/videos/lampe-x1.mov"), { kind: "file", src: "https://abc.public.blob.vercel-storage.com/videos/lampe-x1.mov" });
  assert.equal(parseVideo("https://evil.example/x.mp4.html"), null);
  const amazon = "https://m.media-amazon.com/images/S/vse-vms-transcoding-artifact-eu-west-1-prod/509fe136-e89e-4466-bae0-e944275969d3/default.jobtemplate.hls360.m3u8";
  assert.deepEqual(parseVideo(amazon), { kind: "hls", src: amazon });
});

test("the orders line is rounded down, and silent under 10", () => {
  assert.equal(soldStep(0), null);
  assert.equal(soldStep(9), null);
  assert.equal(soldStep(10), 10);
  assert.equal(soldStep(29), 20);
  assert.equal(soldStep(99), 50);
  assert.equal(soldStep(100), 100);
  assert.equal(soldStep(12_000), 5000);
});
