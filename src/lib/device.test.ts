import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceFromUA, isBot } from "./device";

test("device classes", () => {
  assert.equal(deviceFromUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "mobile");
  assert.equal(deviceFromUA("Mozilla/5.0 (Linux; Android 14; SM-A145F) Mobile Safari"), "mobile");
  assert.equal(deviceFromUA("Mozilla/5.0 (Linux; Android 13; SM-X200) Safari"), "tablet");
  assert.equal(deviceFromUA("Mozilla/5.0 (iPad; CPU OS 17_0)"), "tablet");
  assert.equal(deviceFromUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "desktop");
});

test("bots", () => {
  assert.equal(isBot("Googlebot/2.1"), true);
  assert.equal(isBot("facebookexternalhit/1.1"), true);
  assert.equal(isBot(""), true);
  assert.equal(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), false);
});
