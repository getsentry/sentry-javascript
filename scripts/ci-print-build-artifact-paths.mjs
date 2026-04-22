#!/usr/bin/env node
/**
 * Prints multiline paths for actions/upload-artifact `path` (often wired via a prior step's
 * `GITHUB_OUTPUT` `paths<<EOF` ... `EOF` block), derived from the Nx project
 * graph: merged `outputs` of `build:transpile`, `build:types`, and `build:extension` for
 * every project under `packages/` and `dev-packages/`.
 *
 * Each line is an absolute path pattern suitable for @actions/glob (same style as the
 * previous hand-maintained BUILD_PATHS list). Uses a wildcard in the package name segment
 * plus a shared path suffix, except for the single-segment `build` output directory, which
 * must stay concrete (`packages/deno/build`) so we do not match every package's `build/` tree.
 *
 * Usage: GITHUB_WORKSPACE=<abs repo> yarn ci:print-build-artifact-paths
 * (defaults to cwd when GITHUB_WORKSPACE is unset)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..');
const graphPath = path.join(workspaceRoot, '.nx', 'ci-print-build-artifact-paths-graph.json');

const TARGETS = ['build:transpile', 'build:types', 'build:extension'];

fs.mkdirSync(path.dirname(graphPath), { recursive: true });
execSync(`yarn nx graph --file="${graphPath}"`, {
  cwd: workspaceRoot,
  stdio: ['ignore', 'pipe', 'inherit'],
});

const { graph } = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
try {
  fs.unlinkSync(graphPath);
} catch {
  // ignore
}

/** @type {Map<string, Set<string>>} key = `${kind}\0${suffix}` */
const groups = new Map();

for (const node of Object.values(graph.nodes)) {
  const root = node.data?.root;
  if (!root || (!root.startsWith('packages/') && !root.startsWith('dev-packages/'))) {
    continue;
  }

  const [kind, pkg] = root.split('/');
  if (!kind || !pkg) {
    continue;
  }

  const targets = node.data?.targets || {};
  for (const targetName of TARGETS) {
    const outputs = targets[targetName]?.outputs;
    if (!Array.isArray(outputs)) {
      continue;
    }

    for (const output of outputs) {
      const rel = output.replace(/\{projectRoot\}/g, root).replace(/\\/g, '/');
      const prefix = `${kind}/${pkg}/`;
      if (!rel.startsWith(prefix)) {
        throw new Error(`Unexpected Nx output (missing project prefix): ${rel}`);
      }
      const suffix = rel.slice(prefix.length);
      const key = `${kind}\0${suffix}`;
      if (!groups.has(key)) {
        groups.set(key, new Set());
      }
      groups.get(key).add(pkg);
    }
  }
}

const ws = (process.env.GITHUB_WORKSPACE || workspaceRoot).replace(/\\/g, '/');
const lines = new Set();

for (const [key, pkgSet] of groups) {
  const [kind, suffix] = key.split('\0');
  const needsConcretePath = pkgSet.size === 1 && !suffix.includes('/') && !/[?*]/.test(suffix) && suffix === 'build';

  if (needsConcretePath) {
    const pkg = [...pkgSet][0];
    lines.add(`${ws}/${kind}/${pkg}/build`);
  } else {
    lines.add(`${ws}/${kind}/*/${suffix}`);
  }
}

process.stdout.write([...lines].sort((a, b) => a.localeCompare(b)).join('\n'));
if (lines.size) {
  process.stdout.write('\n');
}
