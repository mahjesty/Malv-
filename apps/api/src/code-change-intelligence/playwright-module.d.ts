/**
 * Optional runtime dependency: `playwright` is loaded via dynamic import.
 * This stub keeps `tsc` happy when the package is not installed (capture path skips gracefully).
 */
declare module "playwright" {
  export type Browser = {
    newPage: (options?: { viewport?: { width: number; height: number } }) => Promise<Page>;
    close: () => Promise<void>;
  };
  export type Page = {
    emulateMedia: (options: { colorScheme?: string }) => Promise<void>;
    goto: (url: string, options?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
    reload: (options?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
    screenshot: (options?: { type?: string; fullPage?: boolean }) => Promise<Buffer>;
    evaluate: (fn: () => void) => Promise<unknown>;
    route: (
      pattern: string,
      handler: (route: { continue: () => Promise<void> }) => void | Promise<void>
    ) => Promise<void>;
    unroute: (pattern: string) => Promise<void>;
    locator: (selector: string) => {
      count: () => Promise<number>;
      first: () => {
        count: () => Promise<number>;
        hover: (options?: { timeout?: number }) => Promise<void>;
        focus: () => Promise<void>;
      };
    };
    close: () => Promise<void>;
  };
  export const chromium: {
    launch: (options?: { headless?: boolean }) => Promise<Browser>;
  };
}
