import type { ExecSyncOptions } from "node:child_process";
import { execSync } from "node:child_process";
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

  function readDirRecursive(currentDir: string, relativePath = ""): void {
    const entries = readdirSync(currentDir);

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);
      const relativeFilePath = relativePath ? join(relativePath, entry) : entry;

      if (stat.isDirectory()) {
        // Recursively read subdirectories
        readDirRecursive(fullPath, relativeFilePath);
      } else if (stat.isFile()) {
        let contents = readFileSync(fullPath, "utf-8");
        // We replace the current SHA with a placeholder to make snapshots deterministic
        contents = contents
          .replaceAll(CURRENT_SHA, "CURRENT_SHA")
          .replaceAll(/"nodeVersion":\d+/g, `"nodeVersion":"NODE_VERSION"`)
          .replaceAll(/"nodeVersion": \d+/g, `"nodeVersion":"NODE_VERSION"`)
          .replaceAll(/nodeVersion:\d+/g, `nodeVersion:"NODE_VERSION"`)
          .replaceAll(/nodeVersion: \d+/g, `nodeVersion:"NODE_VERSION"`)
          .replaceAll(process.cwd().replace(/\\/g, "/"), "");

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
            .replace(/"[a-f0-9]{16}"/g, '"SHORT_UUID"')
            .replaceAll(process.version, "NODE_VERSION")
            .replace(/"ci":false/g, '"ci":true')
            .replace(/"platform":".+?"/g, '"platform":"PLATFORM"')
            .replace(/"duration":[\d.]+/g, '"duration":DURATION')
            .replace(/"start_timestamp":[\d.]+/g, '"start_timestamp":START_TIMESTAMP')
            .replace(/"timestamp":[\d.]+/g, '"timestamp":TIMESTAMP')
            .replace(/"release":"[\d.]+"/g, '"release":"PLUGIN_VERSION"');
        } else {
          // Normalize Windows line endings for cross-platform snapshots
          contents = contents.replace(/\r\n/g, "\n");
          // Normalize debug IDs to make snapshots deterministic across environments
          contents = contents.replace(
            /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
            "00000000-0000-0000-0000-000000000000"
          );
        }
        // Use forward slashes for consistent cross-platform keys
        files[relativeFilePath.replace(/\\/g, "/")] = contents;
      }
    }
  }

  readDirRecursive(directory);
  return files;
}

const tempDirs: string[] = [];

export function createTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), `sentry-bundler-plugin-${randomUUID()}`));
  tempDirs.push(tempDir);
  return tempDir;
}

process.on("exit", () => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Runs a callback with a fake Sentry server running on an auto-allocated port.
 * The server returns 503 errors for all requests.
 * Automatically starts and stops the server.
 * The allocated port is passed to the callback.
 */
export async function withFakeSentryServer(
  callback: (port: string) => void | Promise<void>
): Promise<void> {
  const { createServer } = await import("node:http");

  const server = createServer((req, res) => {
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log("[FAKE SENTRY] incoming request", req.url);
    }
    res.statusCode = 503;
    res.end("Error: Sentry unreachable");
  });

  // Listen on port 0 to get an auto-allocated port
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to get server port");
  }
  const port = address.port.toString();

  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log(`[FAKE SENTRY] running on http://localhost:${port}/`);
  }

  try {
    await callback(port);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}
