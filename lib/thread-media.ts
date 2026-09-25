/**
 * Which of a thread's image attachments load eagerly.
 *
 * ChatScroll pins a thread to its bottom, so the newest images are the ones on
 * screen when it opens. Lazy-loading them would only make them later: their
 * fetch would start after hydration and the pin instead of while the HTML
 * parses. An image bubble is about 295px tall (a 240px image plus padding,
 * byline and gap), so a thread pane shows about three. Every older image sits
 * above the pinned view and loads lazily as the operator scrolls up.
 */
export const EAGER_THREAD_IMAGES = 3;

type ThreadMessage = {
  id: string;
  media_url?: string | null;
  media_type?: string | null;
};

/**
 * Ids of the newest `count` messages whose attachment renders as an image
 * (MessageBubble's test: a media_type starting "image/"). `messages` is
 * ordered oldest first, as the thread renders it.
 */
export function newestImageIds(
  messages: readonly ThreadMessage[],
  count: number = EAGER_THREAD_IMAGES,
): Set<string> {
  const ids = new Set<string>();
  for (let i = messages.length - 1; i >= 0 && ids.size < count; i--) {
    const m = messages[i];
    if (m.media_url && (m.media_type ?? "").startsWith("image/")) ids.add(m.id);
  }
  return ids;
}
