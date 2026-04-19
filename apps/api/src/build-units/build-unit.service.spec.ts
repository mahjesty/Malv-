jest.mock("./catalog-html-to-png.util", () => ({
  tryRenderHtmlCatalogSnapshotPng: jest.fn().mockResolvedValue(null)
}));

import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { BuildUnitService } from "./build-unit.service";
import { SYSTEM_UNITS } from "./system-catalog.definitions";
import { BuildUnitEntity } from "../db/entities/build-unit.entity";
import { BuildUnitVersionEntity } from "../db/entities/build-unit-version.entity";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUnit(overrides: Partial<any> = {}): any {
  return {
    id:                   "unit-1",
    slug:                 "landing-page",
    title:                "Landing Page",
    description:          "Test description",
    type:                 "template",
    category:             "site",
    tags:                 ["react"],
    prompt:               "Build a landing page",
    codeSnippet:          "// code here",
    previewImageUrl:      null,
    authorUserId:         null,
    authorLabel:          "MALV",
    visibility:           "public",
    sourceKind:           "system",
    originalBuildUnitId:  null,
    forkable:             true,
    downloadable:         true,
    verified:             true,
    trending:             true,
    recommended:          false,
    isNew:                false,
    accent:               "oklch(0.65 0.14 220)",
    usesCount:            100,
    forksCount:           20,
    downloadsCount:       50,
    metadataJson:         null,
    executionProfileJson: { requiresInput: false, steps: [], estimatedComplexity: "low" },
    createdAt:            new Date("2026-01-01"),
    updatedAt:            new Date("2026-01-01"),
    archivedAt:           null,
    ...overrides
  };
}

function makeTaskLinksRepo(stubs: Partial<any> = {}): any {
  return {
    create: jest.fn((x: any) => x),
    save:   jest.fn(async (x: any) => ({ id: "link-1", ...x })),
    ...stubs
  };
}

function makeProductivity(): any {
  return {
    createTask: jest.fn().mockResolvedValue({ id: "task-1", title: "Landing Page", status: "todo" })
  };
}

function makeSvc(
  unitsRepoStubs: Partial<any> = {},
  taskLinksRepoStubs: Partial<any> = {},
  opts?: { versionRepo?: any; compositionsRepo?: any }
): BuildUnitService {
  const versionRepo =
    opts?.versionRepo ??
    ({
      find:   jest.fn().mockResolvedValue([]),
      create: jest.fn((x: any) => x),
      save:   jest.fn(async (x: any) => x)
    } as any);

  const compositionsRepo =
    opts?.compositionsRepo ??
    ({
      find:   jest.fn().mockResolvedValue([]),
      create: jest.fn((x: any) => x),
      save:   jest.fn(async (x: any) => x)
    } as any);

  const innerFindOne = unitsRepoStubs.findOne ?? jest.fn();
  const innerSave    = unitsRepoStubs.save ?? jest.fn(async (x: any) => ({ ...x }));
  const innerUpdate  = unitsRepoStubs.update ?? jest.fn().mockResolvedValue({ affected: 1 });

  const unitsRepo: any = {
    findOne: innerFindOne,
    save:    innerSave,
    update:  innerUpdate,
    increment: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([])
    }),
    create: jest.fn((x: any) => x),
    manager: {
      transaction: jest.fn(async (cb: any) =>
        cb({
          getRepository: (Ent: unknown) => {
            if (Ent === BuildUnitVersionEntity) return versionRepo;
            if (Ent === BuildUnitEntity) {
              return {
                findOne: innerFindOne,
                save:    innerSave
              };
            }
            return {
              findOne: innerFindOne,
              save:    innerSave
            };
          }
        })
      )
    },
    ...unitsRepoStubs
  };

  if (unitsRepoStubs.manager) unitsRepo.manager = unitsRepoStubs.manager;

  const fileUnderstanding = {
    assertUserOwnsFile: jest.fn().mockImplementation(async (userId: string, fileId: string) => ({
      id:           fileId,
      originalName: "file.bin",
      mimeType:     "image/png",
      user:         { id: userId }
    })),
    persistUploadAndRegister: jest.fn(),
    readBinaryForAuthorFile:  jest.fn()
  };

  return new BuildUnitService(
    unitsRepo,
    makeTaskLinksRepo(taskLinksRepoStubs),
    makeProductivity(),
    versionRepo,
    compositionsRepo,
    fileUnderstanding as any,
    undefined
  );
}

// ─── ensureCatalogPreviewSnapshotForUnit ─────────────────────────────────────

describe("BuildUnitService.ensureCatalogPreviewSnapshotForUnit", () => {
  it("points previewSnapshotId at HTML preview when PNG grid snapshot is unavailable", async () => {
    const htmlFileId = "html-preview-file";
    const unit = makeUnit({
      sourceKind:          "user",
      authorUserId:        "owner-1",
      previewImageUrl:     null,
      previewFileId:       htmlFileId,
      previewSnapshotId:   null,
      visibility:          "private"
    });
    const updateSpy = jest.fn().mockResolvedValue({ affected: 1 });
    const persistSpy = jest.fn();

    const assertUserOwnsFile = jest.fn().mockImplementation(async (_uid: string, fileId: string) => ({
      id:           fileId,
      originalName: fileId === htmlFileId ? "preview.html" : "explore-preview-snapshot.svg",
      mimeType:     fileId === htmlFileId ? "text/html" : "image/svg+xml",
      user:         { id: "owner-1" }
    }));

    const svc = makeSvc({ findOne: jest.fn().mockResolvedValue(unit), update: updateSpy });
    (svc as any).fileUnderstanding.assertUserOwnsFile = assertUserOwnsFile;
    (svc as any).fileUnderstanding.readBinaryForAuthorFile = jest.fn().mockResolvedValue({
      buffer: Buffer.from("<html><body>x</body></html>", "utf8"),
      mimeType: "text/html"
    });
    (svc as any).fileUnderstanding.persistUploadAndRegister = persistSpy;

    await svc.ensureCatalogPreviewSnapshotForUnit("owner-1", "unit-1");

    expect(updateSpy).toHaveBeenCalledWith(
      { id: "unit-1" },
      { previewSnapshotId: htmlFileId }
    );
    expect(persistSpy).not.toHaveBeenCalled();
  });

  it("replaces a persisted placeholder SVG with HTML preview when PNG is unavailable", async () => {
    const htmlFileId = "html-preview-file";
    const svgSnapId = "old-svg-snap";
    const unit = makeUnit({
      sourceKind:        "user",
      authorUserId:      "owner-1",
      previewImageUrl:   null,
      previewFileId:     htmlFileId,
      previewSnapshotId: svgSnapId,
      visibility:        "private"
    });
    const updateSpy = jest.fn().mockResolvedValue({ affected: 1 });
    const assertUserOwnsFile = jest.fn().mockImplementation(async (_uid: string, fileId: string) => ({
      id:           fileId,
      originalName: fileId === htmlFileId ? "preview.html" : "explore-preview-snapshot.svg",
      mimeType:     fileId === htmlFileId ? "text/html" : "image/svg+xml",
      user:         { id: "owner-1" }
    }));

    const svc = makeSvc({ findOne: jest.fn().mockResolvedValue(unit), update: updateSpy });
    (svc as any).fileUnderstanding.assertUserOwnsFile = assertUserOwnsFile;
    (svc as any).fileUnderstanding.readBinaryForAuthorFile = jest.fn().mockResolvedValue({
      buffer: Buffer.from("<html></html>", "utf8"),
      mimeType: "text/html"
    });

    await svc.ensureCatalogPreviewSnapshotForUnit("owner-1", "unit-1");

    expect(updateSpy).toHaveBeenCalledWith(
      { id: "unit-1" },
      { previewSnapshotId: htmlFileId }
    );
  });
});

// ─── getUnit ─────────────────────────────────────────────────────────────────

describe("BuildUnitService.getUnit", () => {
  it("returns unit when public and user is not owner", async () => {
    const unit = makeUnit({ visibility: "public" });
    const svc = makeSvc({ findOne: jest.fn().mockResolvedValue(unit) });
    const result = await svc.getUnit("any-user", "unit-1");
    expect(result.id).toBe("unit-1");
  });

  it("throws NotFoundException when unit does not exist", async () => {
    const svc = makeSvc({ findOne: jest.fn().mockResolvedValue(null) });
    await expect(svc.getUnit("u1", "missing")).rejects.toThrow(NotFoundException);
  });

  it("throws ForbiddenException for private unit when user is not owner", async () => {
    const unit = makeUnit({ visibility: "private", authorUserId: "owner-id" });
    const svc = makeSvc({ findOne: jest.fn().mockResolvedValue(unit) });
    await expect(svc.getUnit("other-user", "unit-1")).rejects.toThrow(ForbiddenException);
  });

  it("returns private unit when user is the owner", async () => {
    const unit = makeUnit({ visibility: "private", authorUserId: "owner-id" });
    const svc = makeSvc({ findOne: jest.fn().mockResolvedValue(unit) });
    const result = await svc.getUnit("owner-id", "unit-1");
    expect(result.id).toBe("unit-1");
  });

  it("backfills executionProfileJson when missing", async () => {
    const unit = makeUnit({ visibility: "public", executionProfileJson: null });
    const updateSpy = jest.fn().mockResolvedValue({ affected: 1 });
    const svc = makeSvc({ findOne: jest.fn().mockResolvedValue(unit), update: updateSpy });
    const result = await svc.getUnit("any", "unit-1");
    expect(updateSpy).toHaveBeenCalled();
    expect(result.executionProfileJson).toBeDefined();
  });
});

// ─── forkUnit ─────────────────────────────────────────────────────────────────

describe("BuildUnitService.forkUnit", () => {
  it("creates a fork with correct lineage fields", async () => {
    const source = makeUnit({ forkable: true, sourceKind: "system" });
    const saveSpy = jest.fn().mockImplementation(async (x: any) => ({ id: "fork-id", ...x }));
    const svc = makeSvc({
      findOne: jest
        .fn()
        .mockResolvedValueOnce(source) // getUnit call
        .mockResolvedValueOnce(null), // existing fork check
      save: saveSpy,
      increment: jest.fn().mockResolvedValue(undefined)
    });

    await svc.forkUnit("user-1", "unit-1");

    expect(saveSpy).toHaveBeenCalled();
    const saved = saveSpy.mock.calls[0][0];
    expect(saved.originalBuildUnitId).toBe("unit-1");
    expect(saved.authorUserId).toBe("user-1");
    expect(saved.sourceKind).toBe("user");
    expect(saved.visibility).toBe("private");
    expect(saved.verified).toBe(false);
    expect(saved.trending).toBe(false);
    expect(saved.executionProfileJson).toBeDefined();
  });

  it("returns existing fork if user already forked this unit (idempotent)", async () => {
    const source   = makeUnit({ forkable: true });
    const existing = makeUnit({ id: "existing-fork", authorUserId: "user-1", originalBuildUnitId: "unit-1" });
    const saveSpy  = jest.fn();
    const svc = makeSvc({
      findOne: jest.fn().mockResolvedValueOnce(source).mockResolvedValueOnce(existing),
      save: saveSpy
    });

    const result = await svc.forkUnit("user-1", "unit-1");
    expect(result.id).toBe("existing-fork");
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("throws BadRequestException when source unit is not forkable", async () => {
    const unit = makeUnit({ forkable: false });
    const svc  = makeSvc({ findOne: jest.fn().mockResolvedValue(unit) });
    await expect(svc.forkUnit("user-1", "unit-1")).rejects.toThrow(BadRequestException);
  });
});

// ─── updateUnit ────────────────────────────────────────────────────────────────

describe("BuildUnitService.updateUnit", () => {
  it("throws ForbiddenException when user does not own the unit", async () => {
    const unit = makeUnit({ authorUserId: "real-owner", sourceKind: "user" });
    const svc = makeSvc({ findOne: jest.fn().mockResolvedValue(unit) });
    await expect(svc.updateUnit({ userId: "intruder", unitId: "unit-1", title: "Hacked" })).rejects.toThrow(
      ForbiddenException
    );
  });

  it("throws ForbiddenException when trying to edit a system unit", async () => {
    const unit = makeUnit({ authorUserId: "user-1", sourceKind: "system" });
    const svc = makeSvc({ findOne: jest.fn().mockResolvedValue(unit) });
    await expect(svc.updateUnit({ userId: "user-1", unitId: "unit-1", title: "New title" })).rejects.toThrow(
      ForbiddenException
    );
  });

  it("updates allowed fields for the owner", async () => {
    const unit = makeUnit({ authorUserId: "user-1", sourceKind: "user" });
    const saveSpy = jest.fn().mockResolvedValue({ ...unit, title: "Updated" });
    const svc = makeSvc({ findOne: jest.fn().mockResolvedValue(unit), save: saveSpy });
    await svc.updateUnit({ userId: "user-1", unitId: "unit-1", title: "Updated" });
    expect(saveSpy).toHaveBeenCalled();
    const arg = saveSpy.mock.calls[0][0];
    expect(arg.title).toBe("Updated");
  });

  it("persists a version snapshot before applying updates when body has patch fields", async () => {
    const unit = makeUnit({ authorUserId: "user-1", sourceKind: "user", title: "Before" });
    const versionSave = jest.fn().mockResolvedValue({});
    const versionRepo = {
      find:   jest.fn().mockResolvedValue([]),
      create: jest.fn((x: any) => x),
      save:   versionSave
    };
    const saveSpy = jest.fn().mockResolvedValue({ ...unit, title: "After" });
    const svc = makeSvc({ findOne: jest.fn().mockResolvedValue(unit), save: saveSpy }, {}, { versionRepo });
    await svc.updateUnit({ userId: "user-1", unitId: "unit-1", title: "After" });
    expect(versionSave).toHaveBeenCalled();
    const verArg = versionSave.mock.calls[0][0];
    expect(verArg.versionNumber).toBe(1);
    expect(verArg.snapshotJson).toMatchObject({ title: "Before" });
  });
});

// ─── sendToTask ───────────────────────────────────────────────────────────────

describe("BuildUnitService.sendToTask", () => {
  it("creates a task and a task link, increments usesCount", async () => {
    const unit    = makeUnit({ visibility: "public", prompt: "Build a page" });
    const saveSpy = jest.fn().mockImplementation(async (x: any) => ({ id: "link-1", ...x }));
    const incrementSpy = jest.fn().mockResolvedValue(undefined);
    const svc = makeSvc(
      { findOne: jest.fn().mockResolvedValue(unit), increment: incrementSpy },
      { create: jest.fn((x: any) => x), save: saveSpy }
    );

    const result = await svc.sendToTask("user-1", "unit-1");

    expect((svc as any).productivity.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        userId:              "user-1",
        title:               unit.title,
        sourceType:          "explore_unit",
        sourceReferenceId:   unit.id
      })
    );
    expect(incrementSpy).toHaveBeenCalledWith({ id: unit.id }, "usesCount", 1);
    expect(result.taskLinkId).toBeDefined();
    expect(result.task.id).toBe("task-1");
  });
});

// ─── createUnit ───────────────────────────────────────────────────────────────

describe("BuildUnitService.createUnit", () => {
  it("creates a unit with correct ownership and defaults", async () => {
    const saveSpy = jest.fn().mockImplementation(async (x: any) => ({ id: "new-unit", ...x }));
    const svc = makeSvc({ save: saveSpy });

    await svc.createUnit({
      userId:   "user-1",
      title:    "My Component",
      type:     "component",
      category: "ui"
    });

    expect(saveSpy).toHaveBeenCalled();
    const saved = saveSpy.mock.calls[0][0];
    expect(saved.authorUserId).toBe("user-1");
    expect(saved.sourceKind).toBe("user");
    expect(saved.visibility).toBe("private");
    expect(saved.verified).toBe(false);
    expect(saved.trending).toBe(false);
    expect(saved.usesCount).toBe(0);
    expect(saved.forksCount).toBe(0);
    expect(saved.originalBuildUnitId).toBeNull();
    expect(saved.executionProfileJson).toBeDefined();
  });

  it("throws BadRequestException when title is empty", async () => {
    const svc = makeSvc();
    await expect(svc.createUnit({ userId: "u1", title: "  ", type: "template", category: "site" })).rejects.toThrow(
      BadRequestException
    );
  });

  it("throws BadRequestException when type is invalid", async () => {
    const svc = makeSvc();
    await expect(
      svc.createUnit({ userId: "u1", title: "Test", type: "invalid_type", category: "ui" })
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException when category is empty", async () => {
    const svc = makeSvc();
    await expect(svc.createUnit({ userId: "u1", title: "Test", type: "component", category: "" })).rejects.toThrow(
      BadRequestException
    );
  });

  it("respects explicit visibility when provided", async () => {
    const saveSpy = jest.fn().mockImplementation(async (x: any) => ({ id: "u", ...x }));
    const svc = makeSvc({ save: saveSpy });
    await svc.createUnit({ userId: "u1", title: "Public unit", type: "template", category: "site", visibility: "public" });
    expect(saveSpy.mock.calls[0][0].visibility).toBe("public");
  });

  it("generates a slug from the title", async () => {
    const saveSpy = jest.fn().mockImplementation(async (x: any) => ({ id: "u", ...x }));
    const svc = makeSvc({ save: saveSpy });
    await svc.createUnit({ userId: "u1", title: "My Awesome Component", type: "component", category: "ui" });
    const { slug } = saveSpy.mock.calls[0][0];
    expect(typeof slug).toBe("string");
    expect(slug).toContain("my-awesome-component");
  });
});

// ─── updateUnit (extended fields) ────────────────────────────────────────────

describe("BuildUnitService.updateUnit — extended fields", () => {
  it("updates forkable, downloadable, and accent when provided", async () => {
    const unit = makeUnit({ authorUserId: "user-1", sourceKind: "user" });
    const saveSpy = jest.fn().mockResolvedValue({ ...unit });
    const svc = makeSvc({ findOne: jest.fn().mockResolvedValue(unit), save: saveSpy });
    await svc.updateUnit({
      userId:       "user-1",
      unitId:       "unit-1",
      forkable:     false,
      downloadable: false,
      accent:       "oklch(0.6 0.2 200)"
    });
    const arg = saveSpy.mock.calls[0][0];
    expect(arg.forkable).toBe(false);
    expect(arg.downloadable).toBe(false);
    expect(arg.accent).toBe("oklch(0.6 0.2 200)");
  });
});

// ─── createComposition ─────────────────────────────────────────────────────────

describe("BuildUnitService.createComposition", () => {
  it("rejects fewer than two units", async () => {
    const svc = makeSvc();
    await expect(
      svc.createComposition({ userId: "u1", name: "My bundle", unitIds: ["a"] })
    ).rejects.toThrow(BadRequestException);
  });

  it("saves composition when all units are accessible", async () => {
    const u1 = makeUnit({ id: "a", visibility: "public" });
    const u2 = makeUnit({ id: "b", visibility: "public" });
    let call = 0;
    const findOne = jest.fn().mockImplementation(() => {
      call++;
      return call === 1 ? Promise.resolve(u1) : Promise.resolve(u2);
    });
    const compSave = jest.fn(async (x: any) => x);
    const compositionsRepo = { find: jest.fn(), create: jest.fn((x: any) => x), save: compSave };
    const svc = makeSvc({ findOne }, {}, { compositionsRepo });
    await svc.createComposition({ userId: "u1", name: "Bundle", unitIds: ["a", "b"] });
    expect(compSave).toHaveBeenCalled();
    expect(compSave.mock.calls[0][0].unitIds).toEqual(["a", "b"]);
  });
});

// ─── improveUnit ───────────────────────────────────────────────────────────────

describe("BuildUnitService.improveUnit", () => {
  it("creates a new fork-like unit linked to the source", async () => {
    const source = makeUnit({ visibility: "public", sourceKind: "system", title: "Landing" });
    const saveSpy = jest.fn().mockImplementation(async (x: any) => ({ ...x, id: "improved-id" }));
    const findOne = jest
      .fn()
      .mockResolvedValueOnce(source) // getUnit(source)
      .mockResolvedValueOnce(null); // improve path shouldn't need second - only one getUnit in improve
    const svc = makeSvc({
      findOne,
      save:      saveSpy,
      increment: jest.fn().mockResolvedValue(undefined)
    });
    const out = await svc.improveUnit("user-1", "unit-1");
    expect(out.id).toBe("improved-id");
    expect(saveSpy).toHaveBeenCalled();
    const row = saveSpy.mock.calls[0][0];
    expect(row.originalBuildUnitId).toBe("unit-1");
    expect(row.title).toContain("improved");
    expect(row.metadataJson?.improvedFromUnitId).toBe("unit-1");
  });
});

// ─── seedSystemUnits ─────────────────────────────────────────────────────────

describe("BuildUnitService.seedSystemUnits", () => {
  it("seeds missing system units and skips existing ones", async () => {
    let callCount = 0;
    const findOneFn = jest.fn().mockImplementation(async () => {
      callCount++;
      return callCount <= 3 ? null : makeUnit();
    });
    const saveSpy = jest.fn().mockImplementation(async (x: any) => x);
    const svc = makeSvc({ findOne: findOneFn, save: saveSpy });

    const result = await svc.seedSystemUnits();

    expect(result.seeded).toBe(3);
    expect(result.skipped).toBe(SYSTEM_UNITS.length - 3);
    expect(saveSpy).toHaveBeenCalledTimes(3);
  });
});
