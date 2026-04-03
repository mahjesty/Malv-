import { MetricsController } from "./metrics.controller";

describe("MetricsController security", () => {
  it("blocks non-admin metrics access", async () => {
    const c = new MetricsController({
      metricsContentType: jest.fn().mockResolvedValue("text/plain"),
      renderPrometheus: jest.fn().mockResolvedValue("ok")
    } as any);
    const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn(), setHeader: jest.fn() };
    await c.metrics({ user: { role: "user" } } as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
