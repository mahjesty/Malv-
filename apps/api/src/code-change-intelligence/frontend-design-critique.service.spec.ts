import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DesignCritiqueService } from "./frontend-design-critique.service";

describe("DesignCritiqueService", () => {
  const svc = new DesignCritiqueService();

  it("returns bounded score and dimensions for repo web tree", () => {
    const out = svc.critiqueFromCwd([]);
    expect(out.designQualityScore).toBeGreaterThanOrEqual(0);
    expect(out.designQualityScore).toBeLessThanOrEqual(100);
    expect(out.dimensions.hierarchy).toBeGreaterThanOrEqual(0);
    expect(out.dimensions.interaction).toBeGreaterThanOrEqual(0);
    expect(out.designCritiqueSummary.length).toBeGreaterThan(10);
  });

  it("flags centered/card patterns in synthetic TSX", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "malv-crit-"));
    const web = path.join(dir, "apps", "web", "src");
    fs.mkdirSync(web, { recursive: true });
    const row =
      '<div className="flex justify-center items-center max-w-xl mx-auto gap-4 rounded-xl shadow-md p-4" />';
    const bad = `export function X(){return <div className="flex flex-col">${row.repeat(40)}</div>;}`;
    fs.writeFileSync(path.join(web, "Bad.tsx"), bad, "utf8");
    const out = svc.critique(dir, ["apps/web/src/Bad.tsx"]);
    expect(out.issues.some((i) => i.code === "centered_layout_cluster" || i.code === "generic_card_stack")).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
