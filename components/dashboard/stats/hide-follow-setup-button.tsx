"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { SsButton } from "@/components/ss/controls";
import {
  followSetupHiddenCookie,
  readFollowSetupHidden,
  withFollowSetupHidden,
} from "@/lib/follow-setup-cookie";

/**
 * "Hide" on the Statistics prompt to set up follower tracking, for accounts that
 * can't or won't use it (ManyChat's Follow to DM trigger is a Meta beta). The
 * choice is remembered in a cookie the server reads, so the prompt never flashes
 * in before hiding, and it is kept per account (`accountId`, the account being
 * viewed) so hiding it while viewing one client never hides it for another. Then
 * the page re-renders without it. The steps stay on the Connection tab, and the
 * follower report itself still shows once a follow is recorded.
 */
export function HideFollowSetupButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <SsButton
      type="button"
      variant="ghost"
      size="md"
      aria-label="Hide this prompt"
      title="Hide this prompt. The steps stay on each chatbot's Connection tab."
      disabled={pending}
      onClick={() => {
        const value = withFollowSetupHidden(readFollowSetupHidden(document.cookie), accountId);
        document.cookie = followSetupHiddenCookie(value, window.location.protocol === "https:");
        startTransition(() => router.refresh());
      }}
    >
      Hide
    </SsButton>
  );
}
