import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';


/** Remove orchestrion-instrumented packages from a `serverExternalPackages` list. */
export function filterInstrumentedExternals(externals: string[], instrumented: string[]): string[] {
  const set = new Set(instrumented);
  return externals.filter(name => !set.has(name));
}

/**
 * Next's own default-external package list. Resolved from the project (Next isn't a dep of
 * `@sentry/nextjs`), reading the file relative to `next/package.json` since the deep path isn't an
 * exports subpath. The file is `.json` or `.jsonc` (with comments) depending on the Next version.
 */
export function getNextDefaultExternals(projectDir: string): string[] {
  try {
    const nextDir = path.dirname(createRequire(path.join(projectDir, 'package.json')).resolve('next/package.json'));
    for (const ext of ['json', 'jsonc']) {
      const p = path.join(nextDir, 'dist', 'lib', `server-external-packages.${ext}`);
      if (fs.existsSync(p)) {
        const jsonc = fs
          .readFileSync(p, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
          .replace(/^\s*\/\/.*$/gm, '') // line comments
          .replace(/,(\s*[\]}])/g, '$1'); // trailing commas
        return JSON.parse(jsonc) as string[];
      }
    }
    return [];
  } catch {
    return [];
  }
}

// Only packages Next externalizes by default need `transpilePackages` to be bundled; the rest are
// bundled just by being absent from `serverExternalPackages`.
export function getTranspilePackages({
  instrumented,
  nextDefaultExternals,
  isInstalled,
}: {
  instrumented: string[];
  nextDefaultExternals: string[];
  isInstalled: (name: string) => boolean;
}): string[] {
  const defaults = new Set(nextDefaultExternals);
  return instrumented.filter(name => defaults.has(name) && isInstalled(name));
}

/** Whether a package is resolvable from the project directory. */
export function makeIsInstalled(projectDir: string): (name: string) => boolean {
  const req = createRequire(path.join(projectDir, 'package.json'));
  return (name: string) => {
    try {
      req.resolve(`${name}/package.json`);
      return true;
    } catch {
      return false;
    }
  };
}
