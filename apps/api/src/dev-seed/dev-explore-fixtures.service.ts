import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { BuildUnitEntity, type BuildUnitType } from "../db/entities/build-unit.entity";
import { SourceIntakeSessionEntity } from "../db/entities/source-intake-session.entity";
import { FileUnderstandingService } from "../file-understanding/file-understanding.service";
import { BuildUnitService } from "../build-units/build-unit.service";
import { computeExecutionProfile } from "../build-units/build-unit-execution-profile.util";
import {
  INTAKE_AUDIT_DISCLAIMER,
  INTAKE_SCANNER_VERSION
} from "../source-intake/source-intake-static-audit.util";
import { MALV_LANDING_PREVIEW_FILENAME, MALV_LANDING_PREVIEW_SOURCE } from "./malv-landing-preview.source";

const FIXTURE_UNIT_TAG = "explore-landing-preview-unit";
const FIXTURE_INTAKE_TAG = "explore-landing-preview-intake";

const UNIT_TITLE = "MALV Live Preview Fixture";
const UNIT_DESCRIPTION =
  "Deterministic dev-only golden path for MALV Live Preview V1: approved intake, ready preview artifact, HTML bytes, and Explore detail iframe QA.";
const UNIT_CATEGORY = "code";
const UNIT_TYPE: BuildUnitType = "component";
const UNIT_TAGS = ["live-preview-fixture", "landing-page", "ai", "malv", "react", "tailwind", "preview-test"];

/**
 * Deterministic HTML for live preview QA: fully self-contained (no app CSS / Tailwind / external sheets).
 * Full-width landing layout so iframe height and display modes show realistic scale (outer MALV chrome is separate from this document).
 */
const FIXTURE_LIVE_PREVIEW_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>MALV Live Preview Fixture</title><style>
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0f172a;color:#e2e8f0;line-height:1.5}
.hero{min-height:72vh;display:flex;flex-direction:column;justify-content:center;padding:clamp(32px,6vw,80px) clamp(20px,4vw,56px);background:linear-gradient(165deg,#1e3a5f 0%,#0f172a 45%,#020617 100%);border-bottom:1px solid rgba(148,163,184,.2)}
.hero-inner{max-width:56rem;margin:0 auto;width:100%}
.badge{display:inline-block;font-size:.75rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:6px 12px;border-radius:999px;background:rgba(56,189,248,.15);color:#7dd3fc;border:1px solid rgba(56,189,248,.35);margin-bottom:20px}
.hero h1{margin:0 0 16px;font-size:clamp(2rem,4.5vw,3.25rem);font-weight:800;color:#f8fafc;letter-spacing:-.02em;line-height:1.1}
.lead{margin:0 0 12px;font-size:clamp(1.05rem,2vw,1.25rem);color:#cbd5e1;max-width:42rem}
.confirm{margin:0;font-size:1.05rem;font-weight:600;color:#fef08a}
.note{margin-top:20px;font-size:.95rem;color:#94a3b8;max-width:40rem}
.cta-row{margin-top:28px;display:flex;flex-wrap:wrap;gap:12px}
.cta{display:inline-flex;align-items:center;justify-content:center;padding:14px 24px;border-radius:12px;font-weight:600;font-size:1rem;text-decoration:none}
.cta-primary{background:linear-gradient(135deg,#38bdf8,#0ea5e9);color:#0f172a;box-shadow:0 12px 40px rgba(14,165,233,.35)}
.cta-ghost{background:rgba(148,163,184,.12);color:#e2e8f0;border:1px solid rgba(148,163,184,.25)}
.section{padding:clamp(48px,8vw,96px) clamp(20px,4vw,56px);background:#0b1220}
.section-head{max-width:56rem;margin:0 auto 40px;width:100%}
.section h2{margin:0 0 8px;font-size:clamp(1.5rem,3vw,2rem);font-weight:700;color:#f1f5f9}
.section p{margin:0;color:#94a3b8;font-size:1.05rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px;max-width:72rem;margin:0 auto;width:100%}
.card{background:linear-gradient(180deg,rgba(30,41,59,.9),rgba(15,23,42,.95));border:1px solid rgba(148,163,184,.18);border-radius:16px;padding:28px 24px;min-height:160px;box-shadow:0 20px 50px rgba(0,0,0,.35)}
.card h3{margin:0 0 10px;font-size:1.2rem;font-weight:700;color:#e2e8f0}
.card p{margin:0;font-size:.95rem;color:#94a3b8}
.stats{display:flex;flex-wrap:wrap;gap:20px;margin-top:20px;padding-top:20px;border-top:1px solid rgba(148,163,184,.15)}
.stat{font-size:.85rem;color:#64748b}
.stat strong{display:block;font-size:1.5rem;font-weight:800;color:#38bdf8;margin-bottom:4px}
.footer{padding:32px clamp(20px,4vw,56px);background:#020617;border-top:1px solid rgba(51,65,85,.5);text-align:center;font-size:.9rem;color:#64748b}
</style></head><body>
<section class="hero"><div class="hero-inner"><span class="badge">MALV · Live preview fixture</span>
<h1>Ship interfaces your team can actually preview</h1>
<p class="lead">This page is embedded HTML only — no Tailwind, no CDN. If the hero and cards below look large and readable, your outer preview chrome and inner document are both sized correctly.</p>
<p class="confirm">If you can read this, live preview rendering is working.</p>
<p class="note">Dev golden path: scaling should be obvious when you switch Fit, Mobile, Desktop, or Fullscreen in MALV Explore.</p>
<div class="cta-row"><span class="cta cta-primary">Primary action</span><span class="cta cta-ghost">Secondary</span></div></div></section>
<section class="section"><div class="section-head"><h2>Layout blocks</h2><p>Wide sections and a responsive grid mimic a real landing page so iframe height matters.</p></div>
<div class="grid">
<div class="card"><h3>Feature one</h3><p>Full-width sections above and cards here show how content fills the preview area.</p><div class="stats"><div class="stat"><strong>12</strong>Modules</div><div class="stat"><strong>4k</strong>Users</div></div></div>
<div class="card"><h3>Feature two</h3><p>Use display modes to validate mobile vs desktop framing without changing this HTML.</p></div>
<div class="card"><h3>Feature three</h3><p>If this card is invisible, the payload or embed context is wrong — not missing Tailwind in this document.</p></div>
</div></section>
<footer class="footer">MALV Live Preview Fixture · deterministic dev HTML</footer>
</body></html>`;

function landingDetectionJson(fileCount: number): Record<string, unknown> {
  return {
    framework: "react",
    styling: "tailwind",
    probableSurface: "landing-page",
    runtime: "Browser (Vite / Next / CRA typical)",
    probableEntrypoint: "MalvLandingPagePreview.tsx",
    fileCount,
    scannerVersion: "dev-fixture/1.0",
    note: "Metadata from local dev fixture — not async pipeline output."
  };
}

function passChecklist(detail: string) {
  return { state: "pass" as const, detail };
}

@Injectable()
export class DevExploreFixturesService {
  private readonly logger = new Logger(DevExploreFixturesService.name);

  constructor(
    @InjectRepository(BuildUnitEntity)
    private readonly units: Repository<BuildUnitEntity>,
    @InjectRepository(SourceIntakeSessionEntity)
    private readonly intakes: Repository<SourceIntakeSessionEntity>,
    private readonly files: FileUnderstandingService,
    private readonly buildUnits: BuildUnitService
  ) {}

  private async removeFixtureUnits(userId: string): Promise<void> {
    const rows = await this.units.find({ where: { authorUserId: userId } });
    for (const u of rows) {
      const m = u.metadataJson;
      if (m && typeof m === "object" && !Array.isArray(m) && (m as { malvDevFixture?: string }).malvDevFixture === FIXTURE_UNIT_TAG) {
        await this.units.remove(u);
      }
    }
  }

  private async removeFixtureIntakes(userId: string): Promise<void> {
    const rows = await this.intakes.find({ where: { userId } });
    for (const s of rows) {
      const j = s.auditJson;
      if (j && typeof j === "object" && !Array.isArray(j) && (j as { malvDevFixture?: string }).malvDevFixture === FIXTURE_INTAKE_TAG) {
        await this.intakes.remove(s);
      }
    }
  }

  private async bufferAndUpload(userId: string, globalRole?: string) {
    const buffer = Buffer.from(MALV_LANDING_PREVIEW_SOURCE, "utf8");
    return this.files.persistUploadAndRegister({
      userId,
      globalRole: globalRole === "admin" ? "admin" : "user",
      workspaceId: null,
      roomId: null,
      fileKind: "text",
      originalName: MALV_LANDING_PREVIEW_FILENAME,
      mimeType: "text/typescript",
      buffer
    });
  }

  /**
   * Path A — published-style user build unit (Explore My Units + truthful code preview).
   */
  async seedLandingPublishedUnit(userId: string, globalRole?: string): Promise<{ unit: BuildUnitEntity }> {
    await this.removeFixtureUnits(userId);
    const out = await this.bufferAndUpload(userId, globalRole);
    const file = out.file;
    const previewBuf = Buffer.from(FIXTURE_LIVE_PREVIEW_HTML, "utf8");
    const previewOut = await this.files.persistUploadAndRegister({
      userId,
      globalRole: globalRole === "admin" ? "admin" : "user",
      workspaceId: null,
      roomId: null,
      fileKind: "text",
      originalName: "malv-explore-fixture-preview.html",
      mimeType: "text/html",
      buffer: previewBuf
    });
    const source = MALV_LANDING_PREVIEW_SOURCE;
    const codeSnippet = source.slice(0, 28000);
    const slug = `malv-live-preview-fixture-dev-${Date.now()}`;
    const detection = landingDetectionJson(1);

    const row = this.units.create({
      id: randomUUID(),
      slug,
      title: UNIT_TITLE,
      description: UNIT_DESCRIPTION,
      type: UNIT_TYPE,
      category: UNIT_CATEGORY,
      tags: [...UNIT_TAGS],
      prompt:
        "Implement, refine, or integrate this MALV marketing landing page component: preserve premium dark aesthetic, Tailwind styling, and truthful preview posture. Use the attached source as the single source of truth.",
      codeSnippet,
      previewImageUrl: null,
      previewKind: "code",
      previewFileId: previewOut.file.id,
      sourceFileId: file.id,
      sourceFileName: file.originalName ?? MALV_LANDING_PREVIEW_FILENAME,
      sourceFileMime: file.mimeType ?? "text/typescript",
      sourceFileUrl: null,
      authorUserId: userId,
      authorLabel: null,
      visibility: "private",
      sourceKind: "user",
      originalBuildUnitId: null,
      forkable: true,
      downloadable: true,
      verified: false,
      trending: false,
      recommended: false,
      isNew: false,
      accent: "oklch(0.62 0.14 260)",
      usesCount: 0,
      forksCount: 0,
      downloadsCount: 0,
      metadataJson: {
        malvDevFixture: FIXTURE_UNIT_TAG,
        seededAt: new Date().toISOString()
      },
      archivedAt: null,
      intakePreviewState: "ready",
      intakePreviewUnavailableReason: null,
      intakeAuditDecision: "approved",
      intakeDetectionJson: detection
    });
    row.executionProfileJson = computeExecutionProfile(row) as Record<string, unknown>;
    const saved = await this.units.save(row);
    await this.buildUnits.ensureCatalogPreviewSnapshotForUnit(userId, saved.id);
    this.logger.log(`Dev fixture: seeded build unit ${saved.id} for user ${userId}`);
    return { unit: saved };
  }

  /**
   * Path B — terminal approved source intake (Import flow / publish testing).
   */
  async seedLandingSourceIntake(userId: string, globalRole?: string): Promise<{ session: SourceIntakeSessionEntity }> {
    await this.removeFixtureIntakes(userId);
    const out = await this.bufferAndUpload(userId, globalRole);
    const file = out.file;
    const detectionJson = landingDetectionJson(1);
    const auditJson: Record<string, unknown> = {
      malvDevFixture: FIXTURE_INTAKE_TAG,
      scannerVersion: INTAKE_SCANNER_VERSION,
      disclaimer: INTAKE_AUDIT_DISCLAIMER,
      checklist: {
        filesystem: passChecklist("No blocked filesystem patterns in this dev test source."),
        network: passChecklist("No blocked network exfiltration patterns in this dev test source."),
        eval: passChecklist("No blocked dynamic execution patterns in this dev test source."),
        scripts: passChecklist("No blocked lifecycle script patterns in this dev test source.")
      },
      findings: [] as unknown[],
      completedAt: new Date().toISOString(),
      devNote:
        "Seeded terminal session for local testing — not produced by the live async intake pipeline. Safe to delete and re-seed."
    };

    const session = this.intakes.create({
      id: randomUUID(),
      userId,
      status: "approved",
      auditDecision: "approved",
      sourceFileId: file.id,
      detectionJson,
      auditJson,
      auditSummary:
        "Static review found no blocked patterns in this dev test source. This session was seeded locally — it is not a runtime malware verdict.",
      previewState: "unavailable",
      previewUnavailableReason:
        "Live preview pipeline is not yet enabled for source intakes. Use code view on the published unit (Path A) for snippet fallback.",
      buildUnitId: null
    });
    const saved = await this.intakes.save(session);
    this.logger.log(`Dev fixture: seeded intake session ${saved.id} for user ${userId}`);
    return { session: saved };
  }
}
