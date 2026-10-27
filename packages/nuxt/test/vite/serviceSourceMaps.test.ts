import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { PluginContext } from 'rollup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serviceSourceMapsPlugin } from '../../src/vite/serviceSourceMaps';

const CODE = 'export default 1;\n';
const MAP = '{"version":3,"sources":["../../../../app/pages/index.vue"],"mappings":"AAAA"}';

let buildDir: string;

function writeFile(file: string, content: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function load(id: string): unknown {
  const { load } = serviceSourceMapsPlugin(buildDir);
  if (typeof load !== 'function') {
    throw new Error('Expected `load` to be a function');
  }
  return load.call({} as PluginContext, id);
}

describe('serviceSourceMapsPlugin', () => {
  beforeEach(() => {
    buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-nuxt-service-source-maps-'));
  });

  afterEach(() => {
    fs.rmSync(buildDir, { recursive: true, force: true });
  });

  it('loads a service chunk together with its source map', async () => {
    const chunk = writeFile(path.join(buildDir, 'vite', 'services', 'ssr', '_nuxt', 'pages.js'), CODE);
    writeFile(`${chunk}.map`, MAP);

    expect(await load(chunk)).toEqual({ code: CODE, map: MAP });
  });

  it('leaves a service chunk without a source map to the default loader', async () => {
    const chunk = writeFile(path.join(buildDir, 'vite', 'services', 'ssr', '_nuxt', 'export-helper.js'), CODE);

    expect(await load(chunk)).toBeNull();
  });

  it('leaves files outside the service output to the default loader', async () => {
    const file = writeFile(path.join(buildDir, 'sentry-runtime-flags.mjs'), CODE);
    writeFile(`${file}.map`, MAP);

    expect(await load(file)).toBeNull();
  });
});
