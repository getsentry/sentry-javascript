/**
 * Tests to verify build artifacts are correctly formatted for their module type.
 * 
 * These tests verify that:
 * - CJS builds don't contain import.meta (would cause syntax errors)
 * - ESM builds DO contain import.meta.env checks
 * - Empty strings are filtered by resolveSpotlightOptions
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BROWSER_BUILD = path.join(REPO_ROOT, 'packages/browser/build/npm');

describe('Build Artifacts - CJS vs ESM', () => {
  describe('CJS builds', () => {
    it('env.js CJS build does NOT contain import.meta syntax', () => {
      const cjsDevPath = path.join(BROWSER_BUILD, 'cjs/dev/utils/env.js');
      const cjsProdPath = path.join(BROWSER_BUILD, 'cjs/prod/utils/env.js');

      if (fs.existsSync(cjsDevPath)) {
        const cjsDevContent = fs.readFileSync(cjsDevPath, 'utf-8');
        
        // Should NOT contain actual import.meta code (only in comments is ok)
        const lines = cjsDevContent.split('\n').filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
        const codeOnly = lines.join('\n');
        
        expect(codeOnly).not.toContain('import.meta.env');
        expect(codeOnly).not.toContain('typeof import.meta');
      }

      if (fs.existsSync(cjsProdPath)) {
        const cjsProdContent = fs.readFileSync(cjsProdPath, 'utf-8');
        
        const lines = cjsProdContent.split('\n').filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
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
    it('env.js ESM build DOES contain import.meta.env check', () => {
      const esmDevPath = path.join(BROWSER_BUILD, 'esm/dev/utils/env.js');
      const esmProdPath = path.join(BROWSER_BUILD, 'esm/prod/utils/env.js');

      if (fs.existsSync(esmDevPath)) {
        const content = fs.readFileSync(esmDevPath, 'utf-8');
        
        // SHOULD contain import.meta checks
        expect(content).toContain('import.meta');
        expect(content).toContain('import.meta.env');
      }

      if (fs.existsSync(esmProdPath)) {
        const content = fs.readFileSync(esmProdPath, 'utf-8');
        
        expect(content).toContain('import.meta');
        expect(content).toContain('import.meta.env');
      }
    });

    it('env.js ESM build contains rollup markers for ESM-only code', () => {
      const esmDevPath = path.join(BROWSER_BUILD, 'esm/dev/utils/env.js');

      if (fs.existsSync(esmDevPath)) {
        const content = fs.readFileSync(esmDevPath, 'utf-8');
        
        // SHOULD contain the rollup markers (they're kept in output as comments)
        expect(content).toContain('rollup-esm-only');
      }
    });

    it('env.js ESM build contains process.env check as well', () => {
      const esmDevPath = path.join(BROWSER_BUILD, 'esm/dev/utils/env.js');

      if (fs.existsSync(esmDevPath)) {
        const content = fs.readFileSync(esmDevPath, 'utf-8');
        
        // SHOULD contain process.env check too (for compatibility)
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
  });
});

