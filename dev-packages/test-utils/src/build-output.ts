import * as fs from 'fs';
import * as path from 'path';

export interface OutputScanOptions {
  /** Directory holding the emitted bundles, e.g. `<app>/.output/public`. */
  outputDir: string;
  /** Only used to shorten the reported file paths. Defaults to `process.cwd()`. */
  buildDir?: string;
  /** File extensions to scan. Defaults to JavaScript output. */
  extensions?: string[];
}

const JS_EXTENSIONS = ['.js', '.mjs', '.cjs'];

/** `//# sourceMappingURL=…` / `/*# sourceMappingURL=… *\/`, ignoring inline data URIs. */
const SOURCE_MAPPING_URL_PATTERN = /[#@]\s*sourceMappingURL\s*=\s*(?!data:)(\S+)/g;

/** The `sentry-dbid-<uuid>` identifier the bundler plugin injects alongside `_sentryDebugIds`. */
const INJECTED_DEBUG_ID_PATTERN = /sentry-dbid-([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})/gi;

function* walkFiles(outputDir: string, extensions?: string[]): Generator<string> {
  if (!fs.existsSync(outputDir)) {
    throw new Error(`[build-output] Output directory does not exist: ${outputDir}`);
  }

  for (const entry of fs.readdirSync(outputDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    if (extensions && !extensions.includes(path.extname(entry.name))) {
      continue;
    }
    yield path.join(entry.parentPath, entry.name);
  }
}

const SPECIFIER_PATTERNS = [
  /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  /\bfrom\s*["']([^"']+)["']/g,
];

/**
 * Whether the emitted bundle still imports/requires `moduleName` as a bare specifier — i.e. the
 * module was left external instead of inlined into the bundle. Matches ESM `from '<m>'`, dynamic
 * `import('<m>')` and CJS `require('<m>')`, and compares the specifier exactly, so `graphql` never
 * matches `graphql/execution`.
 */
export function bundleReferencesModule(bundleContents: string, moduleName: string): boolean {
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of bundleContents.matchAll(pattern)) {
      if (match[1] === moduleName) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns every absolute-path module specifier in the emitted output, as `<file> → <specifier>`.
 *
 * Such a specifier is baked in at build time, so it only resolves on the build machine: every
 * deploy that relocates the output (Vercel, Docker, `output: 'standalone'`) turns it into a
 * `MODULE_NOT_FOUND` on the first request reaching that chunk. A suite that builds and runs in
 * place can't observe that, hence the direct assertion.
 *
 * Only specifiers count, not any occurrence of a build path — Next.js bakes those into chunks as
 * metadata (`resolvedPagePath`, client-reference proxies), which is inert on relocation.
 */
export function findAbsolutePathImports({
  outputDir,
  buildDir = process.cwd(),
  extensions = JS_EXTENSIONS,
}: OutputScanOptions): string[] {
  const leaks: string[] = [];

  for (const file of walkFiles(outputDir, extensions)) {
    const contents = fs.readFileSync(file, 'utf8');

    for (const pattern of SPECIFIER_PATTERNS) {
      for (const match of contents.matchAll(pattern)) {
        const specifier = match[1] as string;
        if (path.isAbsolute(specifier)) {
          leaks.push(`${path.relative(buildDir, file)} → ${specifier}`);
        }
      }
    }
  }

  return leaks;
}

/**
 * Returns every `.map` file under `outputDir`, relative to `buildDir`.
 *
 * A source map left in a publicly served directory hands out the app's original source to anyone
 * who requests it, so this is the assertion that a "delete after upload" setting actually took
 * effect on the emitted build rather than only on the files the uploader happened to see.
 */
export function findSourceMapFiles({ outputDir, buildDir = process.cwd() }: OutputScanOptions): string[] {
  const maps: string[] = [];

  for (const file of walkFiles(outputDir)) {
    if (file.endsWith('.map')) {
      maps.push(path.relative(buildDir, file));
    }
  }

  return maps;
}

/**
 * Returns every `<file> → <url>` pair where emitted output still points at an external source map.
 *
 * `'hidden'` source maps exist precisely so the map can be uploaded without the bundle advertising
 * it. A surviving comment both 404s in devtools and leaks the map's location, so it means the
 * hidden setting did not reach that bundler. Inline `data:` maps are ignored - those are a
 * different (and separately detectable) failure.
 */
export function findSourceMappingUrlComments({
  outputDir,
  buildDir = process.cwd(),
  extensions = JS_EXTENSIONS,
}: OutputScanOptions): string[] {
  const references: string[] = [];

  for (const file of walkFiles(outputDir, extensions)) {
    const contents = fs.readFileSync(file, 'utf8');

    for (const match of contents.matchAll(SOURCE_MAPPING_URL_PATTERN)) {
      references.push(`${path.relative(buildDir, file)} → ${match[1] as string}`);
    }
  }

  return references;
}

/**
 * Returns the debug IDs the bundler plugin injected into the emitted JavaScript.
 *
 * These are the IDs the SDK reports at runtime, so they are the half of the debug-ID contract that
 * inspecting the upload alone cannot see: an uploaded map is only usable if the shipped bundle
 * claims the same ID.
 */
export function findInjectedDebugIds({ outputDir, extensions = JS_EXTENSIONS }: OutputScanOptions): string[] {
  const debugIds = new Set<string>();

  for (const file of walkFiles(outputDir, extensions)) {
    const contents = fs.readFileSync(file, 'utf8');

    for (const match of contents.matchAll(INJECTED_DEBUG_ID_PATTERN)) {
      debugIds.add((match[1] as string).toLowerCase());
    }
  }

  return [...debugIds];
}
