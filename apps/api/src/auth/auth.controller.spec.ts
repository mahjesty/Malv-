import { AuthController } from "./auth.controller";

describe("AuthController security contract", () => {
  it("login response does not include refreshToken", async () => {
    const controller = new AuthController(
      { login: jest.fn().mockResolvedValue({ accessToken: "a", refreshToken: "r" }) } as any,
      { get: jest.fn().mockReturnValue(undefined) } as any
    );
    const res: any = { cookie: jest.fn() };
    const out = await controller.login({ email: "u@e.com", password: "x" } as any, res);
    expect(out).toEqual({ accessToken: "a" });
    expect((out as any).refreshToken).toBeUndefined();
  });
});
