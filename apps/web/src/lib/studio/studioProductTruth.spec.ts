import assert from "node:assert/strict";
import {
  diffPanelCaption,
  readProductTruth,
  studioResultHeadline,
  studioResultSummaryLines
} from "./studioProductTruth";

(() => {
  assert.deepEqual(readProductTruth(null), { fileHintsAreInferred: true, unifiedDiffAttached: false });
  assert.deepEqual(readProductTruth(undefined), { fileHintsAreInferred: true, unifiedDiffAttached: false });
})();

(() => {
  assert.deepEqual(
    readProductTruth({
      productTruth: { fileHintsAreInferred: false, unifiedDiffAttached: true }
    }),
    { fileHintsAreInferred: false, unifiedDiffAttached: true }
  );
})();

(() => {
  assert.equal(
    studioResultHeadline({
      pendingTitle: "Updated Hero",
      lastUserLine: "make it pop",
      selectedLabel: "Hero",
      hasPreviewRun: true
    }),
    "Updated Hero"
  );
  assert.equal(
    studioResultHeadline({
      pendingTitle: undefined,
      lastUserLine: "Improve spacing",
      selectedLabel: "Navbar",
      hasPreviewRun: true
    }),
    "Preview for: Improve spacing"
  );
})();

(() => {
  const lines = studioResultSummaryLines({
    pending: { execution: { mode: "preview_only", productionWrite: false } },
    selectedLabel: "CTA",
    scopeMode: "section",
    stateTag: "preview",
    previewStatusNote: "Sandbox active."
  });
  assert.ok(lines.some((l) => l.includes("CTA")));
  assert.ok(lines.some((l) => l.includes("Sandbox active.")));
})();

(() => {
  assert.ok(diffPanelCaption({ fileHintsAreInferred: true, unifiedDiffAttached: false }, false).includes("No unified diff"));
})();
