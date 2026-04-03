import assert from "node:assert/strict";
import { getMalvRegionProps, MalvRegion, stableMalvRegionId } from "./malvRegion";

(() => {
  const props = getMalvRegionProps({
    region: "hero",
    id: "landing.hero.primary",
    label: "Hero Section",
    type: "hero"
  });
  assert.deepEqual(props, {
    "data-malv-region": "hero",
    "data-malv-region-id": "landing.hero.primary",
    "data-malv-region-label": "Hero Section",
    "data-malv-region-type": "hero"
  });
})();

(() => {
  const id = stableMalvRegionId({
    region: "section",
    label: "Primary CTA"
  });
  assert.equal(id, "section.primary-cta");
})();

(() => {
  const id = stableMalvRegionId({
    region: "section",
    type: "pricing_grid"
  });
  assert.equal(id, "section.pricing-grid");
})();

(() => {
  const region = MalvRegion({
    as: "section",
    region: "footer",
    label: "Footer",
    className: "test",
    children: "hello"
  }) as {
    type: string;
    props: Record<string, unknown>;
  };
  assert.equal(region.type, "section");
  assert.equal(region.props["data-malv-region"], "footer");
  assert.equal(region.props["data-malv-region-label"], "Footer");
  assert.equal(region.props.className, "test");
})();
