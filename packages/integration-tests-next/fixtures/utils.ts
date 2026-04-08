import { execSync, ExecSyncOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEBUG = !!process.env["DEBUG"];
const CURRENT_SHA = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();

type SourceMap = {
  sources: string[];
  sourcesContent: string[];
};

export function runBundler(command: string, opt: ExecSyncOptions, outDir?: string): void {
  if (outDir) {
    // We've patched the sentry-cli helper to write the args to a file instead of actually executing the command
    opt.env = { ...opt.env, SENTRY_TEST_OUT_DIR: outDir };
  }

  execSync(command, { stdio: DEBUG ? "inherit" : "ignore", ...opt });
}

export function readAllFiles(
  directory: string,
  customReplacer?: (content: string) => string
): Record<string, string> {
  const files: Record<string, string> = {};
  const entries = readdirSync(directory);

  for (const entry of entries) {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);

    if (stat.isFile()) {
      let contents = readFileSync(fullPath, "utf-8");
      // We replace the current SHA with a placeholder to make snapshots deterministic
      contents = contents
        .replaceAll(CURRENT_SHA, "CURRENT_SHA")
        .replaceAll(/"nodeVersion":\d+/g, `"nodeVersion":"NODE_VERSION"`)
        .replaceAll(/"nodeVersion": \d+/g, `"nodeVersion":"NODE_VERSION"`)
        .replaceAll(/nodeVersion:\d+/g, `nodeVersion:"NODE_VERSION"`)
        .replaceAll(/nodeVersion: \d+/g, `nodeVersion:"NODE_VERSION"`);

      if (customReplacer) {
        contents = customReplacer(contents);
      }

      // Normalize Windows stuff in .map paths
      if (entry.endsWith(".map")) {
        const map = JSON.parse(contents) as SourceMap;
        map.sources = map.sources.map((c) => c.replace(/\\/g, "/"));
        map.sourcesContent = map.sourcesContent.map((c) => c.replace(/\r\n/g, "\n"));
        contents = JSON.stringify(map);
      } else if (entry === "sentry-cli-mock.json") {
        // Remove the temporary directory path too
        contents = contents.replace(
          /"[^"]+sentry-bundler-plugin-upload.+?",/g,
          '"sentry-bundler-plugin-upload-path",'
        );
      } else if (entry === "sentry-telemetry.json") {
        // Remove the temporary directory path too
        contents = contents
          .replace(
            /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)/g,
            "TIMESTAMP"
          )
          .replace(/[a-f0-9]{32}/g, "UUID")
          .replace(/"duration":[\d.]+/g, '"duration":DURATION')
          .replace(/"release":"[\d.]+"/g, '"release":"PLUGIN_VERSION"');
      } else {
        // Normalize Windows line endings for cross-platform snapshots
        contents = contents.replace(/\r\n/g, "\n");
      }
      files[entry] = contents;
    }
  }

  return files;
}

const tempDirs: string[] = [];

export function createTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "sentry-bundler-plugin-" + randomUUID()));
  tempDirs.push(tempDir);
  return tempDir;
}

process.on("exit", () => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});
