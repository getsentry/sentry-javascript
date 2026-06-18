import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const TRACING_DIR = path.resolve(__dirname, '../../../src/integrations/tracing');

/**
 * Importing InstrumentationNodeModuleFile from @opentelemetry/instrumentation causes
 * Bun's --bytecode compiler to inline a re-export chain that loses scope bindings.
 * All instrumentations must use the local vendored copy instead.
 */
describe('InstrumentationNodeModuleFile import guard', () => {
  it('no file should import InstrumentationNodeModuleFile from @opentelemetry/instrumentation', () => {
    const offendingFiles: string[] = [];

    function walkDir(dir: string): void {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          // Match multi-line imports: look for an import block from @opentelemetry/instrumentation
          // that includes InstrumentationNodeModuleFile as a named import
          const importBlockRegex =
            /import\s*\{[^}]*InstrumentationNodeModuleFile[^}]*\}\s*from\s*['"]@opentelemetry\/instrumentation['"]/s;
          if (importBlockRegex.test(content)) {
            offendingFiles.push(path.relative(TRACING_DIR, fullPath));
          }
        }
      }
    }

    walkDir(TRACING_DIR);

    expect(offendingFiles).toEqual([]);
  });
});
