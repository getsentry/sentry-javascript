import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import loader from '../../src/orchestrion/bundler/webpack-loader';
import { getSentryInstrumentations, serializeInstrumentations } from '../../src/orchestrion/bundler/webpack';

// Runs the real factory-built loader end-to-end: the loader must transform
// instrumented files (and splice the module-injected snippet) from nothing but
// JSON-serializable options — the exact contract Turbopack holds it to.

// The code transformer reads the instrumented package's version from its
// on-disk `package.json`, so each test package needs a real directory.
function makePackage(root: string, name: string, version: string): void {
  const dir = join(root, 'node_modules', name);
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version }));
}

const MYSQL_CONNECTION_SOURCE =
  "'use strict';\nfunction Connection(){}\nConnection.prototype.query = function query(sql, cb){ return cb(); };\n";

interface LoaderResult {
  error: unknown;
  code: string | undefined;
}

function runLoader(resourcePath: string, code: string, options: Record<string, unknown>): LoaderResult {
  const result: LoaderResult = { error: undefined, code: undefined };
  const context = {
    resourcePath,
    getOptions: () => options,
    async: () => (error: unknown, outCode?: string) => {
      result.error = error;
      result.code = outCode;
    },
  };
  (loader as (this: unknown, code: string) => void).call(context, code);
  return result;
}

describe('orchestrion webpack/Turbopack loader', () => {
  let root: string;
  // The JSON-safe form Turbopack loader options must use (RegExp `filePath`s encoded).
  const instrumentations = JSON.parse(JSON.stringify(serializeInstrumentations(getSentryInstrumentations())));

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'orch-webpack-loader-'));
    makePackage(root, 'mysql', '2.18.1');
    makePackage(root, 'left-pad', '1.3.0');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('transforms an instrumented module and splices the module-injected snippet', () => {
    const { error, code } = runLoader(join(root, 'node_modules/mysql/lib/Connection.js'), MYSQL_CONNECTION_SOURCE, {
      instrumentations,
    });

    expect(error).toBeNull();
    expect(code).toContain('orchestrion:mysql:query');
    expect(code).toMatch(
      /const\s*\{\s*orchestrionModuleInjected,\s*mysqlIntegration\s*\}\s*=\s*require\(["']@sentry\/server-utils["']\)/,
    );
    expect(code).toContain('orchestrionModuleInjected("mysql", mysqlIntegration)');
  });

  it('honors a fixed importSpecifier option', () => {
    const { code } = runLoader(join(root, 'node_modules/mysql/lib/Connection.js'), MYSQL_CONNECTION_SOURCE, {
      instrumentations,
      importSpecifier: 'my-custom-server-utils',
    });

    expect(code).toContain('require("my-custom-server-utils")');
    expect(code).not.toContain('require("@sentry/server-utils")');
  });

  it('derives a per-file relative specifier from importHelperPath (Turbopack)', () => {
    // Turbopack rejects absolute-path imports and bare specifiers that don't
    // resolve from the importing file, so the snippet import must be relative.
    const importHelperPath = join(root, 'node_modules/@sentry/server-utils/build/cjs/index.js');
    const { code } = runLoader(join(root, 'node_modules/mysql/lib/Connection.js'), MYSQL_CONNECTION_SOURCE, {
      instrumentations,
      importHelperPath,
    });

    expect(code).toContain('require("../../@sentry/server-utils/build/cjs/index.js")');
    expect(code).not.toContain('require("@sentry/server-utils")');
  });

  it('passes through files of packages that are not instrumented', () => {
    const source = 'module.exports = function leftPad(){};\n';
    const { error, code } = runLoader(join(root, 'node_modules/left-pad/lib/index.js'), source, { instrumentations });

    expect(error).toBeNull();
    expect(code).toBe(source);
  });

  it('passes through files with no node_modules package context', () => {
    const source = 'export const app = 1;\n';
    const { code } = runLoader('/app/src/index.js', source, { instrumentations });

    expect(code).toBe(source);
  });
});
