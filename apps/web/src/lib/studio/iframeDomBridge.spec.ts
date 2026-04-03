import assert from "node:assert/strict";
import { classifySemanticRegion, computeOverlayRect } from "./previewOverlay";
import {
  isAnnotatedMalvRegion,
  preferAnnotatedTargets,
  semanticSignatureFromParts,
  type BridgeSemanticTarget
} from "./iframeDomBridge";

(() => {
  const signature = semanticSignatureFromParts({
    tagName: "section",
    role: "region",
    id: "pricing",
    className: "hero premium spotlight",
    dataset: { region: "hero", testid: "pricing-section" },
    ariaLabel: "Pricing plans"
  });
  assert.equal(
    signature,
    "section::region::pricing::hero.premium.spotlight::region:hero|testid:pricing-section::pricing plans"
  );
})();

(() => {
  const signature = semanticSignatureFromParts({
    tagName: "section",
    malvRegionId: "hero.primary",
    malvRegionLabel: "Hero Region"
  });
  assert.equal(signature, "malv::id::hero.primary");
})();

(() => {
  const signature = semanticSignatureFromParts({
    tagName: "section",
    malvRegionLabel: "Hero Region",
    malvRegionType: "hero"
  });
  assert.equal(signature, "malv::label::hero_region::hero");
})();

(() => {
  assert.equal(isAnnotatedMalvRegion({ malvRegion: "hero" }), true);
  assert.equal(isAnnotatedMalvRegion({ malvRegionLabel: "Hero" }), true);
  assert.equal(isAnnotatedMalvRegion({}), false);
})();

(() => {
  const targets: BridgeSemanticTarget[] = [
    {
      signature: "heuristic-1",
      label: "Section",
      selector: "sig:heuristic-1",
      componentName: "SECTION",
      contextText: "heuristic",
      region: "section",
      overlayRect: { left: 0, top: 0, width: 100, height: 40 },
      annotated: false
    },
    {
      signature: "malv::id::hero.primary",
      label: "Hero",
      selector: "sig:malv::id::hero.primary",
      componentName: "Hero",
      contextText: "annotated",
      region: "hero",
      overlayRect: { left: 0, top: 0, width: 120, height: 60 },
      annotated: true,
      regionId: "hero.primary"
    }
  ];
  const preferred = preferAnnotatedTargets(targets);
  assert.equal(preferred.length, 1);
  assert.equal(preferred[0]?.signature, "malv::id::hero.primary");
})();

(() => {
  const targets: BridgeSemanticTarget[] = [
    {
      signature: "heuristic-1",
      label: "Section",
      selector: "sig:heuristic-1",
      componentName: "SECTION",
      contextText: "heuristic",
      region: "section",
      overlayRect: { left: 0, top: 0, width: 100, height: 40 },
      annotated: false
    }
  ];
  const preferred = preferAnnotatedTargets(targets);
  assert.equal(preferred.length, 1);
  assert.equal(preferred[0]?.signature, "heuristic-1");
})();

(() => {
  const region = classifySemanticRegion({
    tagName: "nav",
    role: "navigation",
    className: "top-navbar"
  });
  assert.equal(region, "nav");
})();

(() => {
  const rect = computeOverlayRect(
    {
      x: 140,
      y: 100,
      width: 220,
      height: 80,
      top: 100,
      right: 360,
      bottom: 180,
      left: 140,
      toJSON: () => ({})
    } as DOMRect,
    {
      x: 100,
      y: 70,
      width: 800,
      height: 600,
      top: 70,
      right: 900,
      bottom: 670,
      left: 100,
      toJSON: () => ({})
    } as DOMRect
  );
  assert.deepEqual(rect, { left: 40, top: 30, width: 220, height: 80 });
})();
