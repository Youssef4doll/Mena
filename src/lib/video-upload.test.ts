import { test } from "node:test";
import assert from "node:assert/strict";
import { VIDEO_PATH, videoPath } from "./video-upload";

test("a video file gets a clean path the server accepts; other files are refused", () => {
  assert.equal(videoPath("Lampe LED vidéo 1.MP4", "video/mp4"), "produits/lampe-led-video-1.mp4");
  assert.equal(videoPath("IMG_0042.MOV", "video/quicktime"), "produits/img-0042.mov");
  assert.equal(videoPath("لمبة.mp4", "video/mp4"), "produits/video.mp4");
  assert.equal(videoPath("photo.jpg", "image/jpeg"), null);
  for (const p of ["produits/lampe-led-video-1.mp4", "produits/img-0042.mov"]) assert.match(p, VIDEO_PATH);
  for (const p of ["../x.mp4", "produits/a/b.mp4", "produits/x.exe", "autre/x.mp4"]) assert.doesNotMatch(p, VIDEO_PATH);
});
