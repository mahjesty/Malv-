import { buildSuperFixPlan } from "./super-fix-planner";

describe("SuperFix planner hardening", () => {
  it("produces typed-action-only plan", () => {
    const plan = buildSuperFixPlan("there is an error in runtime");
    expect((plan as any).shellReadCommands).toBeUndefined();
    expect(plan.readOnlyTypedActions.length).toBeGreaterThan(0);
    const inspect = plan.readOnlyTypedActions.find((a) => a.actionType === "inspect_logs");
    expect(inspect?.parameters).toMatchObject({ pattern: expect.any(String) });
    expect((inspect?.parameters as any).command).toBeUndefined();
  });
});
