"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { nextPinned } from "@/lib/chat-scroll";

/**
 * Scrollable message container that keeps the latest message in view. Messages
 * render oldest-first, so it opens pinned to the bottom (the natural position
 * for a chat thread) and follows new messages only while the reader is still
 * there: someone scrolled up to read history stays exactly where they are when
 * a reply lands or the page refreshes.
 *
 * `count` is the number of messages rendered. A change in it is the only
 * re-render that can move the scroll, so typing in a composer, a status or tag
 * change, or a router.refresh() that brings no new message leaves it alone.
 * While the reader is following, the view also stays on the bottom when an
 * attachment finishes loading or the box itself gets shorter (the reply
 * composer appearing after "Pause AI", a taller header, a phone keyboard).
 */
export function ChatScroll({
  children,
  className,
  count,
}: {
  children: React.ReactNode;
  className?: string;
  count: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Is the reader following the latest message, as of their LAST scroll, i.e.
  // before the update now landing? Measured after the commit instead, the new
  // message's own height would count against them, and a reply taller than the
  // threshold would unpin a reader sitting right at the bottom. Starts true, so
  // a mount (including opening another thread, which remounts this) lands on
  // the latest message.
  const pinned = useRef(true);
  const lastTop = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      pinned.current = nextPinned(pinned.current, el, lastTop.current);
      lastTop.current = el.scrollTop;
    };
    // Keep a following reader on the bottom when the thread grows or the box
    // shrinks without a new message. load and loadedmetadata do not bubble, so
    // listen in the capture phase.
    const follow = () => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("load", follow, true);
    el.addEventListener("loadedmetadata", follow, true);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(follow);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("load", follow, true);
      el.removeEventListener("loadedmetadata", follow, true);
      ro?.disconnect();
    };
  }, []);

  // A layout effect, so the pin lands before paint and an opened thread never
  // shows a frame of its top. React skips it during SSR and runs it on hydrate.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [count]);

  return (
    <div ref={ref} className={cn("overflow-y-auto", className)}>
      {children}
    </div>
  );
}
