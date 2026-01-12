/**
 * Tests to verify build artifacts are correctly formatted for their module type.
 *
 * These tests verify that:
 * - Both CJS and ESM builds contain the getEnvValue function
 * - Both builds use process.env for environment variable access
 * - Neither build contains import.meta (we intentionally don't use it to avoid CJS errors)
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BROWSER_BUILD = path.join(REPO_ROOT, 'packages/browser/build/npm');

describe('Build Artifacts - env.ts', () => {
  describe('CJS builds', () => {
    it('env.js CJS build does NOT contain import.meta syntax', () => {
      const cjsDevPath = path.join(BROWSER_BUILD, 'cjs/dev/utils/env.js');
      const cjsProdPath = path.join(BROWSER_BUILD, 'cjs/prod/utils/env.js');

      if (fs.existsSync(cjsDevPath)) {
        const cjsDevContent = fs.readFileSync(cjsDevPath, 'utf-8');

        // Should NOT contain actual import.meta code (only in comments is ok)
        const lines = cjsDevContent
          .split('\n')
          .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
        const codeOnly = lines.join('\n');

        expect(codeOnly).not.toContain('import.meta.env');
        expect(codeOnly).not.toContain('typeof import.meta');
      }

      if (fs.existsSync(cjsProdPath)) {
        const cjsProdContent = fs.readFileSync(cjsProdPath, 'utf-8');

        const lines = cjsProdContent
          .split('\n')
          .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
        const codeOnly = lines.join('\n');

        expect(codeOnly).not.toContain('import.meta.env');
        expect(codeOnly).not.toContain('typeof import.meta');
      }
    });

    it('env.js CJS build contains process.env check', () => {
      const cjsDevPath = path.join(BROWSER_BUILD, 'cjs/dev/utils/env.js');

      if (fs.existsSync(cjsDevPath)) {
        const content = fs.readFileSync(cjsDevPath, 'utf-8');

        // SHOULD contain process.env check
        expect(content).toContain('process.env');
      }
    });
  });

  describe('ESM builds', () => {
    it('env.js ESM build also does NOT contain import.meta syntax', () => {
      // We intentionally don't use import.meta.env because it would require
      // a rollup plugin to strip it from CJS builds, and we want consistent
      // behavior across both module formats.
      const esmDevPath = path.join(BROWSER_BUILD, 'esm/dev/utils/env.js');
      const esmProdPath = path.join(BROWSER_BUILD, 'esm/prod/utils/env.js');

      if (fs.existsSync(esmDevPath)) {
        const content = fs.readFileSync(esmDevPath, 'utf-8');

        // Filter out comments
        const lines = content.split('\n').filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
        const codeOnly = lines.join('\n');

        // Should NOT contain import.meta in actual code
        expect(codeOnly).not.toContain('import.meta.env');
      }

      if (fs.existsSync(esmProdPath)) {
        const content = fs.readFileSync(esmProdPath, 'utf-8');

        const lines = content.split('\n').filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
        const codeOnly = lines.join('\n');

        expect(codeOnly).not.toContain('import.meta.env');
      }
    });

    it('env.js ESM build contains process.env check', () => {
      const esmDevPath = path.join(BROWSER_BUILD, 'esm/dev/utils/env.js');

      if (fs.existsSync(esmDevPath)) {
        const content = fs.readFileSync(esmDevPath, 'utf-8');

        // SHOULD contain process.env check
        expect(content).toContain('process.env');
      }
    });
  });

  describe('Both CJS and ESM builds', () => {
    it('contain the getEnvValue export', () => {
      const cjsPath = path.join(BROWSER_BUILD, 'cjs/dev/utils/env.js');
      const esmPath = path.join(BROWSER_BUILD, 'esm/dev/utils/env.js');

      if (fs.existsSync(cjsPath)) {
        const content = fs.readFileSync(cjsPath, 'utf-8');
        expect(content).toContain('getEnvValue');
      }

      if (fs.existsSync(esmPath)) {
        const content = fs.readFileSync(esmPath, 'utf-8');
        expect(content).toContain('getEnvValue');
      }
    });

    it('contain globalThis check for bundler-injected values', () => {
      const cjsPath = path.join(BROWSER_BUILD, 'cjs/dev/utils/env.js');
      const esmPath = path.join(BROWSER_BUILD, 'esm/dev/utils/env.js');

      if (fs.existsSync(cjsPath)) {
        const content = fs.readFileSync(cjsPath, 'utf-8');
        expect(content).toContain('globalThis');
      }

      if (fs.existsSync(esmPath)) {
        const content = fs.readFileSync(esmPath, 'utf-8');
        expect(content).toContain('globalThis');
      }
    });
  });
});
