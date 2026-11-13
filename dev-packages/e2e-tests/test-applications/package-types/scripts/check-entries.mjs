/**
 * Checks that the other checks cover every package and every entry:
 * - The app depends on every `@sentry/*` package of the repository that has types.
 * - Every exports entry without types is in `JS_ONLY_ENTRIES`, because the other checks skip entries without types.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getEntriesWithoutTypes, getPackageNames, JS_ONLY_ENTRIES, PACKAGES_WITHOUT_TYPES } from './entries.mjs';

// The E2E runner and CI set it to the repository root.
const workspaceRoot = process.env.SENTRY_E2E_WORKSPACE_ROOT;
if (!workspaceRoot) {
  console.error('SENTRY_E2E_WORKSPACE_ROOT is not set. Run the app with `pnpm run test:run package-types`.');
  process.exit(1);
}

const failed = [];
const dependencies = new Set(getPackageNames());

const packagesDir = path.join(workspaceRoot, 'packages');
for (const dirent of fs.readdirSync(packagesDir, { withFileTypes: true })) {
  const packageJsonPath = path.join(packagesDir, dirent.name, 'package.json');
  if (!dirent.isDirectory() || !fs.existsSync(packageJsonPath)) {
    continue;
  }
  const { name } = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (name.startsWith('@sentry/') && !dependencies.has(name) && !PACKAGES_WITHOUT_TYPES.has(name)) {
    failed.push(`${name} is not a dependency of this app. Add it to package.json.`);
  }
}

const entriesWithoutTypes = new Set([...dependencies].flatMap(name => getEntriesWithoutTypes(name)));
for (const specifier of entriesWithoutTypes) {
  if (!JS_ONLY_ENTRIES.has(specifier)) {
    failed.push(
      `${specifier} has no types. Add types, or add it to JS_ONLY_ENTRIES if it is a hook, loader or injected file.`,
    );
  }
}
for (const specifier of JS_ONLY_ENTRIES) {
  if (!entriesWithoutTypes.has(specifier)) {
    failed.push(`${specifier} is in JS_ONLY_ENTRIES, but it has types or does not exist. Remove it from the list.`);
  }
}

if (failed.length) {
  console.error(failed.join('\n'));
  process.exit(1);
}

console.log(`Entries: ${dependencies.size} packages, ${JS_ONLY_ENTRIES.size} entries without types.`);
