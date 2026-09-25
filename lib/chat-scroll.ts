/**
 * How far (px) from the bottom a chat reader can be and still count as
 * following the latest message. Past this they are reading history, and a new
 * message must not move them.
 */
export const NEAR_BOTTOM_PX = 120;

type ScrollBox = { scrollHeight: number; scrollTop: number; clientHeight: number };

/** Whether a scroll box sits at, or within `threshold` px of, its bottom edge. */
export function isNearBottom(box: ScrollBox, threshold: number = NEAR_BOTTOM_PX): boolean {
  return box.scrollHeight - box.scrollTop - box.clientHeight < threshold;
}

/**
 * Whether the reader is following the latest message, after a scroll event.
 *
 * Near the bottom always follows. Further up, only a scroll UP (scrollTop fell
 * since the last scroll event) stops following. Our own pin, a scroll-anchoring
 * shift and content growing under a pinned reader all raise or keep scrollTop,
 * so none of them can unpin a reader who never moved. That matters because the
 * scroll event from a pin can land after the NEXT attachment has already grown
 * the thread, and a plain isNearBottom() would then read the reader as gone.
 */
export function nextPinned(
  wasPinned: boolean,
  box: ScrollBox,
  lastTop: number,
  threshold: number = NEAR_BOTTOM_PX,
): boolean {
  if (isNearBottom(box, threshold)) return true;
  return box.scrollTop < lastTop ? false : wasPinned;
}
