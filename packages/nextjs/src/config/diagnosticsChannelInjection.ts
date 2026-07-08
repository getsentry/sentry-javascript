import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

/**
 * Instrumented packages that MUST stay externalized (and thus get instrumented by the runtime
 * module hook instead of the build-time loader): Turbopack cannot bundle them correctly.
 * `mysql` (2.x) corrupts its wire protocol when bundled ("Received packet in the wrong sequence"
 * during the handshake) — even completely untransformed, so this is a bundling incompatibility,
 * not a transform issue.
 */
export const BUNDLE_UNSAFE_INSTRUMENTED_PACKAGES = ['mysql'];

/**
 * The orchestrion runtime machinery, which must NOT be bundled: the code transformer's parser
 * breaks when bundled ("a.parse is not a function"), making the runtime module hook silently
 * return untransformed sources. Externalizing these keeps the hook running from real
 * `node_modules`, so externalized instrumented packages (e.g. `mysql`) get transformed on require.
 */
export const ORCHESTRION_RUNTIME_EXTERNAL_PACKAGES = [
  '@apm-js-collab/tracing-hooks',
  '@apm-js-collab/code-transformer',
];

/** Remove orchestrion-instrumented packages from a `serverExternalPackages` list. */
export function filterInstrumentedExternals(externals: string[], instrumented: string[]): string[] {
  const set = new Set(instrumented);
  return externals.filter(name => !set.has(name));
}

/** The instrumented packages that should be force-bundled (i.e. reached by the build-time loader). */
export function getBundleableInstrumented(instrumented: string[]): string[] {
  const unsafe = new Set(BUNDLE_UNSAFE_INSTRUMENTED_PACKAGES);
  return instrumented.filter(name => !unsafe.has(name));
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
