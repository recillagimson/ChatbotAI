/**
 * The /requests page's Suspense key, and the URL the composer moves to once its
 * first message has created a thread. They live together because the second
 * must never change the first.
 *
 * Every control on /requests changes only the query string: a History item is
 * ?id=, a chatbot in the rail is ?project=, "New request" is bare /requests. A
 * query-only change never re-shows loading.tsx, because Next keys that boundary
 * on the page segment WITHOUT its search params (layout-router.js calls
 * createRouterCacheKey(segment, true)). So the page keys its own boundary on
 * this, and React shows the route skeleton for the next view instead of leaving
 * the previous thread up with no sign anything is happening.
 *
 * ?project= outranks ?id= on purpose. RequestChat's first message creates the
 * thread and then router.replace()s to createdRequestHref(), which keeps
 * ?project=, so this key does not change and the reply the user is reading is
 * not swapped for a skeleton. Keyed on ?id= alone, every new request would
 * blink right after its first reply.
 */
export function requestsPaneKey(sp: { id?: string; project?: string }): string {
  if (sp.project) return `project:${sp.project}`;
  if (sp.id) return `thread:${sp.id}`;
  return "new";
}

/** Where RequestChat moves once its first message has created the thread. */
export function createdRequestHref(chatbotId: string, changeRequestId: string): string {
  const qs = new URLSearchParams({ project: chatbotId, id: changeRequestId });
  return `/requests?${qs.toString()}`;
}
