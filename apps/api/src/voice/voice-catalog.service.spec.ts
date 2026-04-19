import { ConfigService } from "@nestjs/config";
import { VoiceCatalogService } from "./voice-catalog.service";

describe("VoiceCatalogService", () => {
  it("falls back to legacy PIPER_MODEL when catalog JSON is empty", () => {
    const prev = process.env.PIPER_MODEL;
    process.env.PIPER_MODEL = "/tmp/fake.onnx";
    try {
      const svc = new VoiceCatalogService({
        get: () => undefined
      } as unknown as ConfigService);
      const v = svc.listVoices(false);
      expect(v.length).toBe(1);
      expect(v[0]!.id).toBe("malv-default");
    } finally {
      if (prev === undefined) delete process.env.PIPER_MODEL;
      else process.env.PIPER_MODEL = prev;
    }
  });
});
