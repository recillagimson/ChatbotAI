import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";

// Load .env.local into process.env so tests can reach the real OpenAI API
// (Next loads this automatically; Playwright does not). Only fills keys that
// aren't already set in the environment. Minimal KEY=VALUE parser - no deps.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  /* no .env.local - tests that need a key will skip */
}

export default defineConfig({
  testDir: "./tests",
  // These tests call real external APIs (OpenAI vision / Whisper / TTS); give
  // them room and run serially to keep output readable.
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: { headless: true },
});
