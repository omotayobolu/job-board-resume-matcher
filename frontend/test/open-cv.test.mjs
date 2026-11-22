import assert from "node:assert/strict";
import { test } from "node:test";
import { openCvWindow } from "../src/lib/open-cv.ts";

test("CV tab opens before awaiting the signed URL and clears its opener", async () => {
  const events = [];
  let resolve;
  const signed = new Promise((done) => { resolve = done; });
  const popup = { opener: {}, closed: false, close: () => events.push("close"),
    location: { replace: (url) => events.push(url) } };
  const work = openCvWindow(() => {
    events.push("fetch");
    assert.equal(popup.opener, null);
    return signed;
  }, { open: (url) => { events.push(url); return popup; } });
  assert.deepEqual(events, ["about:blank", "fetch"]);
  resolve("https://files.example/cv");
  await work;
  assert.deepEqual(events, ["about:blank", "fetch", "https://files.example/cv"]);
});

test("failed CV fetch closes the blank tab and preserves the error", async () => {
  const failure = new Error("CV unavailable");
  let closed = false;
  const popup = { opener: {}, closed: false, close: () => { closed = true; }, location: {} };
  await assert.rejects(openCvWindow(async () => { throw failure; }, { open: () => popup }), (error) => error === failure);
  assert.equal(closed, true);
});

test("blocked popup does not request a signed URL", async () => {
  await assert.rejects(openCvWindow(async () => { assert.fail("Must not fetch"); }, { open: () => null }), /Allow pop-ups/);
});
