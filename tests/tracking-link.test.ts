import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { DRAFT_SLUG, SLUG_PATTERN, draftLink, trackingLink } from "../lib/tracking-link";

test("draft previews encode a placeholder with the same length as a saved tracking link", () => {
  const origin = "https://qr.mastra.ai";
  const saved = trackingLink(origin, randomBytes(9).toString("base64url"));
  assert.match(DRAFT_SLUG, SLUG_PATTERN);
  assert.equal(draftLink(origin).length, saved.length, "Equal length keeps the preview's module density identical to the saved artwork");
  assert.equal(draftLink(`${origin}/`), `${origin}/q/${DRAFT_SLUG}`);
  assert.notEqual(draftLink(origin), "https://www.mastrabooks.dev/", "A draft must never encode the destination directly");
});
