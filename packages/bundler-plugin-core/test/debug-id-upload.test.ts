import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { prepareBundleForDebugIdUpload } from "../src/debug-id-upload";
import type { RewriteSourcesHook } from "../src/types";
import { Logger } from "../src";

describe("prepareBundleForDebugIdUpload", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sentry-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("passes mapDir context to rewriteSources hook", async () => {
    const bundleDir = path.join(tmpDir, "src");
    const uploadDir = path.join(tmpDir, "upload");
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.mkdirSync(uploadDir, { recursive: true });

    const debugId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const bundlePath = path.join(bundleDir, "bundle.js");
    const mapPath = path.join(bundleDir, "bundle.js.map");

    // Bundle with debug ID snippet and sourceMappingURL
    fs.writeFileSync(
      bundlePath,
      `"use strict";\n// some code\n;!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="${debugId}",e._sentryDebugIdIdentifier="sentry-dbid-${debugId}")}catch(e){}}();\n//# sourceMappingURL=bundle.js.map`
    );

    // Source map file
    fs.writeFileSync(
      mapPath,
      JSON.stringify({
        version: 3,
        sources: ["../original/file.ts"],
        mappings: "AAAA",
      })
    );

    const capturedContexts: Array<{ mapDir?: string } | undefined> = [];
    const rewriteHook: RewriteSourcesHook = (source, _map, context) => {
      capturedContexts.push(context);
      return source;
    };

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    await prepareBundleForDebugIdUpload(
      bundlePath,
      uploadDir,
      0,
      logger as Logger,
      rewriteHook,
      undefined
    );

    expect(capturedContexts).toHaveLength(1);
    expect(capturedContexts[0]!.mapDir).toBe(bundleDir);
  });
});
