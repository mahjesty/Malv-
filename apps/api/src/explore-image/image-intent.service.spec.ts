import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ImageIntentService } from "./image-intent.service";
import { BeastWorkerClient } from "../beast/client/beast-worker.client";
import { InferenceRoutingService } from "../inference/inference-routing.service";

const routingStub = {
  decideForImageExpansion: () => ({
    workerContextPatch: {},
    telemetry: {
      malvTaskClass: "image_test",
      malvPreferredTier: "gpu" as const,
      malvSelectedTier: "unknown" as const,
      malvSelectedBackend: null,
      malvSelectedAgent: "unknown" as const,
      malvFallbackUsed: false,
      malvFallbackReason: null,
      malvRoutingProviderSelected: "primary_chain" as const,
      malvRoutingReason: "test",
      malvRoutingSurface: "image" as const,
      malvRoutingLatencyTier: "interactive" as const,
      malvLightweightTierRequested: false
    }
  })
};

describe("ImageIntentService", () => {
  it("falls back to heuristics when the worker returns nothing", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImageIntentService,
        {
          provide: BeastWorkerClient,
          useValue: {
            infer: jest.fn().mockRejectedValue(new Error("unreachable"))
          }
        },
        {
          provide: ConfigService,
          useValue: {
            get: () => undefined
          }
        },
        { provide: InferenceRoutingService, useValue: routingStub }
      ]
    }).compile();

    const svc = moduleRef.get(ImageIntentService);
    const out = await svc.interpret("A cinematic sunset over the ocean, dramatic mood");

    expect(out.refinedPrompt.length).toBeGreaterThan(10);
    expect(out.inferred.style).toBe("Cinematic");
    expect(out.inferred.mood).toBe("Dramatic");
    expect(out.confidence).toBeGreaterThan(0);
    expect(out.confidence).toBeLessThanOrEqual(1);
  });

  it("returns verbatim brief and skips the worker when skipExpansion is set", async () => {
    const infer = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImageIntentService,
        { provide: BeastWorkerClient, useValue: { infer } },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: InferenceRoutingService, useValue: routingStub }
      ]
    }).compile();

    const svc = moduleRef.get(ImageIntentService);
    const brief = "A long in-app transform recipe " + "x".repeat(90);
    const out = await svc.interpret(brief, undefined, { hasSourceImage: true, skipExpansion: true });

    expect(infer).not.toHaveBeenCalled();
    expect(out.refinedPrompt).toBe(brief);
    expect(out.userPrompt).toBe(brief);
    expect(out.confidence).toBeGreaterThanOrEqual(0.55);
  });

  it("returns empty interpretation for blank prompt", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImageIntentService,
        { provide: BeastWorkerClient, useValue: { infer: jest.fn() } },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: InferenceRoutingService, useValue: routingStub }
      ]
    }).compile();

    const svc = moduleRef.get(ImageIntentService);
    const out = await svc.interpret("   ");
    expect(out.refinedPrompt).toBe("");
    expect(out.confidence).toBe(0);
  });

  it("keeps userPrompt as the original user text when originalUserPrompt is supplied", async () => {
    const infer = jest.fn().mockRejectedValue(new Error("offline"));
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImageIntentService,
        { provide: BeastWorkerClient, useValue: { infer } },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: InferenceRoutingService, useValue: routingStub }
      ]
    }).compile();

    const svc = moduleRef.get(ImageIntentService);
    const expanded =
      "SHORT IDEA Layered internal prelude with cinematic vocabulary and premium framing language.";
    const out = await svc.interpret(expanded, undefined, { originalUserPrompt: "SHORT IDEA" });

    expect(out.userPrompt).toBe("SHORT IDEA");
    expect(out.refinedPrompt.length).toBeGreaterThan(10);
  });
});
