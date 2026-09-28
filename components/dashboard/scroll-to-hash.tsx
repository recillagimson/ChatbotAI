"use client";

import { useEffect } from "react";

/**
 * Scrolls to the element the URL's #hash names, once this mounts.
 *
 * Links like `/chatbots/<id>?tab=prompt#knowledge` need it: the tab body streams
 * in behind a Suspense boundary, so when Next's own hash handling runs on a
 * client navigation the target is often not in the DOM yet and the page stays at
 * the top. Rendered inside the tab body, this runs after the target exists.
 */
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);
  return null;
}
