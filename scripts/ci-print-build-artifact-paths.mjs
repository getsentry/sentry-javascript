#!/usr/bin/env node
/**
 * Prints multiline paths for actions/upload-artifact `path` (often wired via a prior step's
 * `GITHUB_OUTPUT` `paths<<EOF` ... `EOF` block), derived from the Nx project
 * graph: merged `outputs` of `build:transpile`, and `build:types` for
 * every project under `packages/` and `dev-packages/`.
 *
 * Each package keeps its own output paths so artifact discovery starts inside build directories
 * rather than searching the entire packages and dev-packages trees.
 *
 * Usage: GITHUB_WORKSPACE=<abs repo> pnpm run ci:print-build-artifact-paths
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
execSync(`pnpm exec nx graph --file="${graphPath}"`, {
  cwd: workspaceRoot,
  stdio: ['ignore', 'pipe', 'inherit'],
});

const { graph } = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
try {
  fs.unlinkSync(graphPath);
} catch {
  // ignore
}

const ws = (process.env.GITHUB_WORKSPACE || workspaceRoot).replace(/\\/g, '/');
const lines = new Set();

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
      // Negated outputs only narrow a target's Nx cache ownership to keep parallel targets'
      // outputs disjoint; they are not files to exclude from the uploaded artifact — those files
      // are emitted and owned by another target and must still be uploaded via its output.
      if (output.startsWith('!')) {
        continue;
      }
      const rel = output.replace(/\{projectRoot\}/g, root).replace(/\\/g, '/');
      const prefix = `${kind}/${pkg}/`;
      if (!rel.startsWith(prefix)) {
        throw new Error(`Unexpected Nx output (missing project prefix): ${rel}`);
      }
      lines.add(`${ws}/${rel}`);
    }
  }
}

// These checked-in declarations are not emitted by Nx build targets.
for (const file of fs.globSync('packages/*/*.d.ts', { cwd: workspaceRoot })) {
  lines.add(`${ws}/${file}`);
}

process.stdout.write([...lines].sort((a, b) => a.localeCompare(b)).join('\n'));
if (lines.size) {
  process.stdout.write('\n');
}
