import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { remixV3Config } from '../../src/orchestrion/config';
import { createLoadHookTransform } from '../../src/orchestrion/bundler/load-hook';

// The transform reads the package name and version from disk, so the fixture is a real, minimal
// install layout in a temp directory.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'load-hook-'));
const source = 'export function run(init) {\n  return init;\n}\n';

function installRunModule(name: string, version: string): string {
  const pkgDir = path.join(root, 'node_modules', ...name.split('/'));
  fs.mkdirSync(path.join(pkgDir, 'dist', 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name, version }));
  const file = path.join(pkgDir, 'dist', 'runtime', 'run.js');
  fs.writeFileSync(file, source);
  return file;
}

const runFile = installRunModule('@remix-run/ui', '0.11.0');
const componentRunFile = installRunModule('@remix-run/component', '1.0.0');

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('createLoadHookTransform', () => {
  const transform = createLoadHookTransform({ dcModule: '/assets/npm/shim.js', instrumentations: remixV3Config });

  it('instruments a matching module and imports the channel from dcModule', () => {
    const code = transform(runFile, source);

    expect(code).toMatch(/from ["']\/assets\/npm\/shim\.js["']/);
    expect(code).toContain('orchestrion:@remix-run/ui:run');
    // Emitted as an ES module, which is the only thing the asset server can serve.
    expect(code).not.toMatch(/\brequire\(/);
  });

  it('instruments the renamed @remix-run/component 1.x package', () => {
    const code = transform(componentRunFile, source);

    expect(code).toContain('orchestrion:@remix-run/component:run');
  });

  it('leaves a file that is not in an instrumented package alone', () => {
    const other = path.join(root, 'node_modules', 'left-pad', 'index.js');
    fs.mkdirSync(path.dirname(other), { recursive: true });
    fs.writeFileSync(
      path.join(path.dirname(other), 'package.json'),
      JSON.stringify({ name: 'left-pad', version: '1.0.0' }),
    );

    expect(transform(other, 'export const x = 1;')).toBeUndefined();
  });

  it('leaves application code alone', () => {
    expect(transform(path.join(root, 'app', 'entry.js'), source)).toBeUndefined();
  });
});
