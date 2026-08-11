import * as fs from 'fs';
import * as path from 'path';

interface AbsolutePathImportOptions {
  /** Directory holding the emitted bundles, e.g. `<app>/.next/server`. */
  outputDir: string;
  /** Only used to shorten the reported file paths. Defaults to `process.cwd()`. */
  buildDir?: string;
  /** File extensions to scan. Defaults to JavaScript output. */
  extensions?: string[];
}

const SPECIFIER_PATTERNS = [
  /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  /\bfrom\s*["']([^"']+)["']/g,
];

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
  extensions = ['.js', '.mjs', '.cjs'],
}: AbsolutePathImportOptions): string[] {
  if (!fs.existsSync(outputDir)) {
    throw new Error(`[findAbsolutePathImports] Output directory does not exist: ${outputDir}`);
  }

  const leaks: string[] = [];

  for (const entry of fs.readdirSync(outputDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !extensions.includes(path.extname(entry.name))) {
      continue;
    }

    const file = path.join(entry.parentPath, entry.name);
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
