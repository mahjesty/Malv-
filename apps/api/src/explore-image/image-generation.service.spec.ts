import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { MalvTaskRouterService } from "../agent-system/router/malv-task-router.service";
import { FileUnderstandingService } from "../file-understanding/file-understanding.service";
import { ImageGenerationService } from "./image-generation.service";
import { ImageIntentService } from "./image-intent.service";

describe("ImageGenerationService", () => {
  it("returns done with interpretation and plan", async () => {
    const intent = {
      interpret: jest.fn().mockResolvedValue({
        refinedPrompt: "A calm lake at dawn",
        inferred: { mood: "Soft", lighting: "Golden hour" },
        confidence: 0.8
      })
    };
    const files = { assertUserOwnsFile: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImageGenerationService,
        { provide: ImageIntentService, useValue: intent },
        { provide: FileUnderstandingService, useValue: files },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: MalvTaskRouterService, useValue: { route: jest.fn() } }
      ]
    }).compile();

    const svc = moduleRef.get(ImageGenerationService);
    const out = await svc.generate("lake at sunrise");

    expect(out.status).toBe("done");
    expect(out.interpretation.refinedPrompt).toContain("lake");
    expect(out.plan.steps.length).toBeGreaterThan(0);
    expect(out.logs.length).toBeGreaterThan(0);
    expect(out.imageUrl).toBeUndefined();
    const firstArg = intent.interpret.mock.calls[0][0] as string;
    expect(firstArg).toContain("lake at sunrise");
    expect(firstArg).toContain("Stay faithful");
    expect(intent.interpret.mock.calls[0][2]).toMatchObject({ originalUserPrompt: "lake at sunrise" });
  });

  it("sends mode-aware expanded prelude to intent when modeId maps to a preset", async () => {
    const intent = {
      interpret: jest.fn().mockResolvedValue({
        refinedPrompt: "model output",
        inferred: {},
        confidence: 0.9
      })
    };
    const files = { assertUserOwnsFile: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImageGenerationService,
        { provide: ImageIntentService, useValue: intent },
        { provide: FileUnderstandingService, useValue: files },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: MalvTaskRouterService, useValue: { route: jest.fn() } }
      ]
    }).compile();

    const svc = moduleRef.get(ImageGenerationService);
    await svc.generate("desert traveler", undefined, { modeId: "cinematic-desert" });

    const firstArg = intent.interpret.mock.calls[0][0] as string;
    expect(firstArg).toContain("desert traveler");
    expect(firstArg).toContain("Widescreen photographic language");
    expect(intent.interpret.mock.calls[0][2]).toMatchObject({ originalUserPrompt: "desert traveler" });
  });

  it("uses model-expanded prompt for short transform captions when a source image is bound", async () => {
    const expanded = "Transform the subject into soft atmospheric cloud-sculpture volume while preserving silhouette and identity.";
    const intent = {
      interpret: jest.fn().mockResolvedValue({
        refinedPrompt: expanded,
        inferred: {},
        confidence: 0.9
      })
    };
    const files = { assertUserOwnsFile: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImageGenerationService,
        { provide: ImageIntentService, useValue: intent },
        { provide: FileUnderstandingService, useValue: files },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: MalvTaskRouterService, useValue: { route: jest.fn() } }
      ]
    }).compile();

    const svc = moduleRef.get(ImageGenerationService);
    const out = await svc.generate("clouds", undefined, {
      sourceImageFileId: "550e8400-e29b-41d4-a716-446655440000",
      userId: "user-1"
    });

    expect(intent.interpret).toHaveBeenCalled();
    expect(out.interpretation.refinedPrompt).toBe(expanded);
  });

  it("preserves the full client prompt when a source image is bound (transform recipe must not be collapsed)", async () => {
    const longBrief =
      "The subject settles into a polished caricature read—gesture and proportion stretch with playful clarity, yet the person remains unmistakable.";
    const intent = {
      interpret: jest.fn().mockResolvedValue({
        refinedPrompt: "A generic portrait",
        inferred: {},
        confidence: 0.5
      })
    };
    const files = { assertUserOwnsFile: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImageGenerationService,
        { provide: ImageIntentService, useValue: intent },
        { provide: FileUnderstandingService, useValue: files },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: MalvTaskRouterService, useValue: { route: jest.fn() } }
      ]
    }).compile();

    const svc = moduleRef.get(ImageGenerationService);
    const out = await svc.generate(longBrief, undefined, {
      sourceImageFileId: "550e8400-e29b-41d4-a716-446655440000",
      userId: "user-1"
    });

    expect(intent.interpret).toHaveBeenCalled();
    expect(out.interpretation.refinedPrompt).toBe(longBrief);
    expect(out.directionSummary.length).toBeGreaterThan(10);
  });

  it("rejects empty prompt when a source image is supplied", async () => {
    const intent = { interpret: jest.fn() };
    const files = { assertUserOwnsFile: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImageGenerationService,
        { provide: ImageIntentService, useValue: intent },
        { provide: FileUnderstandingService, useValue: files },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: MalvTaskRouterService, useValue: { route: jest.fn() } }
      ]
    }).compile();

    const svc = moduleRef.get(ImageGenerationService);
    await expect(
      svc.generate("  \n  ", undefined, {
        sourceImageFileId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-1"
      })
    ).rejects.toThrow(BadRequestException);
    expect(intent.interpret).not.toHaveBeenCalled();
  });
});
