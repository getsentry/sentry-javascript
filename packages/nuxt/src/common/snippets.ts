import * as fs from 'fs';
import * as path from 'path';

/** Returns an import snippet */
export function buildSdkInitFileImportSnippet(filePath: string): string {
  const posixPath = filePath.split(path.sep).join(path.posix.sep);

  // normalize to forward slashed for Windows-based systems
  const normalizedPath = posixPath.replace(/\\/g, '/');

  return `import '${normalizedPath}';`;
}

/**
 * Script tag inside `nuxt-root.vue` (root component we get from NuxtApp)
 */
export const SCRIPT_TAG = '<script setup>';

/**
 * Adds a top-level import statement right after <script setup>.
 * This should happen as early as possible (e.g. in root component)
 */
export function addImportStatement(filePath: string, importStatement: string): void {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const scriptIndex = data.indexOf(SCRIPT_TAG);

    if (scriptIndex === -1) {
      // eslint-disable-next-line no-console
      console.warn(`[Sentry] Sentry not initialized. Could not find ${SCRIPT_TAG} in ${filePath}`);
      return;
    }

    // Insert the import statement after the script tag
    const output = data.replace(SCRIPT_TAG, `${SCRIPT_TAG}\n${importStatement}\n`);

    try {
      fs.writeFileSync(filePath, output, 'utf8');
    } catch (err) {
      //  eslint-disable-next-line no-console
      console.error(`[Sentry] Error writing file to ${filePath}: ${err}`);
    }
  } catch (err) {
    //  eslint-disable-next-line no-console
    console.error(`[Sentry] Error reading file at ${filePath}: ${err}`);
  }
}
