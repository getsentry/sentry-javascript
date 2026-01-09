import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

function readBuildFile(relativePathFromPackageRoot: string): string {
  const filePath = join(process.cwd(), relativePathFromPackageRoot);
  return readFileSync(filePath, 'utf8');
}

describe('build artifacts', () => {
  it('does not contain Node-only `process.argv0` usage (Edge compatibility)', () => {
    const cjs = readBuildFile('build/cjs/index.js');
    const esm = readBuildFile('build/esm/index.js');

    expect(cjs).not.toContain('process.argv0');
    expect(esm).not.toContain('process.argv0');
  });

  it('does not contain ES2021 logical assignment operators (ES2020 compatibility)', () => {
    const cjs = readBuildFile('build/cjs/index.js');
    const esm = readBuildFile('build/esm/index.js');

    // ES2021 operators which `es-check es2020` rejects
    expect(cjs).not.toContain('??=');
    expect(cjs).not.toContain('||=');
    expect(cjs).not.toContain('&&=');

    expect(esm).not.toContain('??=');
    expect(esm).not.toContain('||=');
    expect(esm).not.toContain('&&=');
  });
});
