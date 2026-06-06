export function canScrollAxis(element: HTMLElement, axis: "x" | "y"): boolean {
  if (axis === "y") {
    return element.scrollHeight > element.clientHeight + 1;
  }
  return element.scrollWidth > element.clientWidth + 1;
}

/** Redirect vertical wheel delta to horizontal scroll when only horizontal overflow exists. */
export function applyVerticalWheelAsHorizontalScroll(
  container: HTMLElement,
  deltaY: number,
  deltaX: number,
): boolean {
  if (!canScrollAxis(container, "x")) return false;
  if (canScrollAxis(container, "y")) return false;
  if (Math.abs(deltaY) <= Math.abs(deltaX)) return false;
  if (deltaY === 0) return false;

  container.scrollLeft += deltaY;
  return true;
}

export function handleWheelRedirect(container: HTMLElement, event: WheelEvent): void {
  if (applyVerticalWheelAsHorizontalScroll(container, event.deltaY, event.deltaX)) {
    event.preventDefault();
  }
}
