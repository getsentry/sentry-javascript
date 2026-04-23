#!/usr/bin/env node
/**
 * Prints multiline paths for actions/upload-artifact `path` (often wired via a prior step's
 * `GITHUB_OUTPUT` `paths<<EOF` ... `EOF` block), derived from the Nx project
 * graph: merged `outputs` of `build:transpile`, and `build:types` for
 * every project under `packages/` and `dev-packages/`.
 *
 * Each line is an absolute path pattern suitable for @actions/glob (same style as the
 * previous hand-maintained BUILD_PATHS list). If exactly one project declares a given
 * output suffix, the path uses that package name (no glob in the package segment). If several
 * projects share a suffix, a shared glob pattern under packages/ or dev-packages/ is used when
 * safe. The lone path segment "build" is never turned into a broad glob (that would match
 * every package); several projects with a top-level build output each get their own path.
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

const TARGETS = ['build:transpile', 'build:types'];

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

// A glob like packages + star + slash + "build" matches every package's build tree, so we
// never emit that when several projects each declare a top-level {projectRoot}/build output.
function isUnsafeSharedTopLevelBuildSuffix(suffix, pkgCount) {
  return pkgCount > 1 && !suffix.includes('/') && !/[?*]/.test(suffix) && suffix === 'build';
}

for (const [key, pkgSet] of groups) {
  const [kind, suffix] = key.split('\0');
  const pkgs = [...pkgSet].sort((a, b) => a.localeCompare(b));
  const n = pkgs.length;

  if (n === 1) {
    lines.add(`${ws}/${kind}/${pkgs[0]}/${suffix}`);
    continue;
  }

  if (isUnsafeSharedTopLevelBuildSuffix(suffix, n)) {
    for (const pkg of pkgs) {
      lines.add(`${ws}/${kind}/${pkg}/build`);
    }
    continue;
  }

  lines.add(`${ws}/${kind}/*/${suffix}`);
}

process.stdout.write([...lines].sort((a, b) => a.localeCompare(b)).join('\n'));
if (lines.size) {
  process.stdout.write('\n');
}
