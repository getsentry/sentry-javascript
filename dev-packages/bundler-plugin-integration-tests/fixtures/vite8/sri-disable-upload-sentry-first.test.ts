import { expect } from "vitest";
import { checkSubresourceIntegrity } from "../utils";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, outDir }) => {
  runBundler();

  const checks = checkSubresourceIntegrity(outDir);
  expect(checks).not.toHaveLength(0);
  expect(checks.filter((check) => !check.valid)).toEqual([]);
  expect(checks.some((check) => check.source.includes("//# debugId="))).toBe(true);
});
