/** True when the drag payload is likely files (desktop file drag from OS / Finder). */
export function dataTransferLikelyHasFiles(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  return Array.from(dt.types).some((t) => t === "Files" || t === "application/x-moz-file");
}

/** Whether pointer coordinates are still inside the given DOM rect (dragleave flicker guard). */
export function pointInsideRect(
  clientX: number,
  clientY: number,
  rect: DOMRectReadOnly,
  tolerancePx = 0
): boolean {
  return (
    clientX >= rect.left - tolerancePx &&
    clientX <= rect.right + tolerancePx &&
    clientY >= rect.top - tolerancePx &&
    clientY <= rect.bottom + tolerancePx
  );
}
