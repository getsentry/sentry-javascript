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
 * Adds a top-level import statement right after <script setup>.
 * This should happen as early as possible (e.g. in root component)
 */
export function addImportStatement(filePath: string, importStatement: string): void {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const scriptIndex = data.indexOf('<script setup>');

    // Insert the import statement after the script tag
    const output = [
      data.slice(0, scriptIndex + '<script setup>'.length),
      '\n',
      importStatement,
      data.slice(scriptIndex + '<script setup>'.length),
    ].join('');

    try {
      fs.writeFileSync(filePath, output, 'utf8');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[Sentry] Error writing file to ${filePath}: ${err}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[Sentry] Error reading file at ${filePath}: ${err}`);
  }
}
