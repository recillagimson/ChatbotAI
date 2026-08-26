import { defineConfig } from "vitest/config";
import path from "path";

// Minimal vitest config: wires up the "@/*" path alias (mirrors
// tsconfig.json's "paths") so lib/* unit tests can import via "@/lib/...",
// and scopes `test.include` to the pure unit specs so a bare
// `npx vitest run` doesn't sweep in the existing @playwright/test specs
// (tests/inbound-media.spec.ts, tests/memory.spec.ts) or lib/sanitize.test.mts.
export default defineConfig({
  test: {
    include: [
      "tests/link-flow*.spec.ts",
      "tests/flow-state*.spec.ts",
      "tests/lead-facts*.spec.ts",
      "tests/manual-followups*.spec.ts",
      "tests/kb-access*.spec.ts",
      "tests/conversation-screen*.spec.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
