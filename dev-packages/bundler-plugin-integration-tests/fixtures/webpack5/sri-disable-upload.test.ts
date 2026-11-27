import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { checkSubresourceIntegrity } from "../utils";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, outDir }) => {
  runBundler();

  const checks = checkSubresourceIntegrity(outDir);
  expect(checks).not.toHaveLength(0);
  expect(checks.filter((check) => !check.valid)).toEqual([]);
  expect(checks.some((check) => check.source.includes("//# debugId="))).toBe(true);

  // The webpack runtime holds the hashes of the lazy chunks.
  const chunks = readdirSync(outDir).filter((file) => file.endsWith(".js"));
  const chunkHashes = chunks.map(
    (file) => `sha384-${createHash("sha384").update(readFileSync(join(outDir, file))).digest("base64")}`
  );
  const runtimeHashes = [
    ...readFileSync(join(outDir, "main.js"), "utf-8").matchAll(/"(sha384-[A-Za-z0-9+/=]+)"/g),
  ].map((match) => match[1]);
  expect(runtimeHashes).not.toHaveLength(0);
  for (const hash of runtimeHashes) {
    expect(chunkHashes).toContain(hash);
  }
});
