import {
  malvActionSupportForBridge,
  malvActionSupportForPlatform,
  malvCanonicalActionMatrix
} from "./malv-external-action-support.matrix";

describe("malv-external-action-support.matrix", () => {
  it("keeps a canonical platform matrix with all key platforms", () => {
    const matrix = malvCanonicalActionMatrix();
    expect(matrix.android.open_url.support).toBe("supported");
    expect(matrix.ios.deep_link_to_task_context.support).toBe("supported_with_caveat");
    expect(matrix.desktop.show_notification.support).toBe("supported");
    expect(matrix.browser.create_local_reminder.support).toBe("unsupported");
  });

  it("reports bridge support from canonical platform matrix", () => {
    expect(malvActionSupportForBridge("open_url", "desktop_agent")).toBe("supported");
    expect(malvActionSupportForBridge("create_local_reminder", "browser_agent")).toBe("unsupported");
  });

  it("exposes truthful iOS caveats", () => {
    const support = malvActionSupportForPlatform("open_url", "ios");
    expect(support.support).toBe("supported_with_caveat");
    expect(support.foregroundOnly).toBe(true);
  });
});

