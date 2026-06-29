/**
 * Injects ambient type shims into the downleveled TS 3.8 declarations.
 *
 * `server-utils` re-exports types that reference `node:diagnostics_channel`, a module missing from
 * the `@types/node@14` the TS 3.8 compatibility check uses. We copy a shim declaring that module into
 * the ts3.8 output and reference it from the entry point so it is loaded by downstream consumers.
 * Scoped to ts3.8 only — the modern build resolves the module from `@types/node` directly.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const ts38Dir = join(packageRoot, 'build', 'types-ts3.8');

const SHIM_FILENAME = 'node-diagnostics-channel.d.ts';
const shimSource = join(packageRoot, 'types-shims', SHIM_FILENAME);
const shimTarget = join(ts38Dir, SHIM_FILENAME);

copyFileSync(shimSource, shimTarget);

const entry = join(ts38Dir, 'index.d.ts');
const reference = `/// <reference path="./${SHIM_FILENAME}" />\n`;
const contents = readFileSync(entry, 'utf8');

if (!contents.startsWith(reference)) {
  writeFileSync(entry, reference + contents);
}
