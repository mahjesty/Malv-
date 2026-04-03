import assert from "node:assert/strict";
import { classifySemanticRegion } from "./previewOverlay";

(() => {
  assert.equal(classifySemanticRegion({ tagName: "nav" }), "nav");
  assert.equal(classifySemanticRegion({ className: "hero-banner" }), "hero");
  assert.equal(classifySemanticRegion({ tagName: "form", className: "signup" }), "form");
  assert.equal(classifySemanticRegion({ className: "pricing-card-grid" }), "card_group");
})();

