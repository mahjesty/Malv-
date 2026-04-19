/**
 * Reference-counted body scroll lock so nested overlays (e.g. fullscreen preview + other modals)
 * do not leave document.body stuck with overflow:hidden after one surface closes.
 *
 * Use: `const release = lockBodyScroll()` and call `release()` on close/unmount (or pass to `unlockBodyScroll`).
 */

let depth = 0;
let savedOverflow: string | null = null;

function bodyOverflowForLog(): string {
  if (typeof document === "undefined") return "n/a";
  return document.body.style.overflow || "(empty)";
}

export type BodyScrollLockRelease = () => void;

/**
 * Increment lock depth; apply overflow:hidden when depth becomes 1.
 * Returned function decrements depth and restores the previous inline overflow when depth returns to 0.
 */
export function lockBodyScroll(): BodyScrollLockRelease {
  if (typeof document === "undefined") return () => {};

  if (import.meta.env.DEV) {
    console.log("[MALV bodyScrollLock] lock before depth=%s bodyOverflow=%s", depth, bodyOverflowForLog());
  }

  if (depth === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (import.meta.env.DEV) {
      console.log("[MALV bodyScrollLock] applied depth→1 bodyOverflow=%s", bodyOverflowForLog());
    }
  }
  depth += 1;

  if (import.meta.env.DEV) {
    console.log("[MALV bodyScrollLock] lock after depth=%s bodyOverflow=%s", depth, bodyOverflowForLog());
  }

  return () => {
    if (typeof document === "undefined") return;

    if (import.meta.env.DEV) {
      console.log("[MALV bodyScrollLock] unlock call depth(before)=%s bodyOverflow=%s", depth, bodyOverflowForLog());
    }

    if (depth <= 0) {
      if (import.meta.env.DEV) {
        console.warn("[MALV bodyScrollLock] unlock ignored — depth already 0 (orphan release)");
      }
      return;
    }

    depth -= 1;

    if (import.meta.env.DEV) {
      console.log("[MALV bodyScrollLock] unlock after depth=%s bodyOverflow=%s", depth, bodyOverflowForLog());
    }

    if (depth === 0) {
      document.body.style.overflow = savedOverflow ?? "";
      savedOverflow = null;
      if (import.meta.env.DEV) {
        console.log("[MALV bodyScrollLock] released depth=0 restored bodyOverflow=%s", bodyOverflowForLog());
      }
    } else if (import.meta.env.DEV) {
      console.log("[MALV bodyScrollLock] release deferred nested depth=%s", depth);
    }
  };
}

/** Symmetric alias for the disposer returned by `lockBodyScroll` (readability at call sites). */
export function unlockBodyScroll(release: BodyScrollLockRelease): void {
  release();
}

/** Current nesting depth (0 = no lock held). For dev diagnostics only. */
export function getBodyScrollLockDepth(): number {
  return depth;
}

/**
 * Dev-oriented escape hatch: clears lock state and removes inline body overflow.
 * Do not use for normal UI flow — prefer paired lock/release.
 */
export function forceReleaseBodyScrollLock(): void {
  if (typeof document === "undefined") return;
  const before = depth;
  depth = 0;
  savedOverflow = null;
  document.body.style.overflow = "";
  if (import.meta.env.DEV) {
    console.warn("[MALV bodyScrollLock] force-release reset depth %s→0 bodyOverflow=%s", before, bodyOverflowForLog());
  }
}
