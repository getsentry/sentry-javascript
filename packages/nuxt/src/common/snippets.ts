import * as fs from 'fs';
import * as path from 'path';

// todo: tests
/** Returns an import snippet */
export function buildSdkInitFileImportSnippet(filePath: string): string {
  const pathToPosix = (originalPath: string): string => {
    return originalPath.split(path.sep).join(path.posix.sep);
  };

  return `import "${pathToPosix(filePath)}";`;
}

// todo: tests
/** Adds an import statement right after <script setup> */
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
      console.error(`Error writing file: ${err}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Error reading file: ${err}`);
  }
}
