import { expect } from "vitest";
import { test } from "./utils";
import { withFakeSentryServer } from "../utils";

test(import.meta.url, async ({ runBundler }) => {
  await withFakeSentryServer((port) => {
    // Run bundler with fake server - should succeed despite server errors
    runBundler({
      FAKE_SENTRY_PORT: port,
      SENTRY_HTTP_MAX_RETRIES: "1", // Only retry once to avoid timeout
    });

    // If we get here, the build succeeded (didn't throw)
    expect(true).toBe(true);
  });
});
