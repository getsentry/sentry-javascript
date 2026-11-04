import { describe, expect, it } from 'vitest';

const { parsePnpmWorkspacePackages } = require('./verify-packages-versions');

const WORKSPACE = [
  'packages:',
  '  - packages/core',
  "  - 'packages/browser'",
  '  - "dev-packages/test-utils"',
  '',
  'catalog:',
  '  vitest: ^3.0.0',
  '',
].join('\n');

describe('parsePnpmWorkspacePackages', () => {
  it('reads the packages list up to the next top-level key', () => {
    expect(parsePnpmWorkspacePackages(WORKSPACE)).toEqual([
      'packages/core',
      'packages/browser',
      'dev-packages/test-utils',
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parsePnpmWorkspacePackages(WORKSPACE.replace(/\n/g, '\r\n'))).toEqual([
      'packages/core',
      'packages/browser',
      'dev-packages/test-utils',
    ]);
  });

  it('returns an empty list without a packages key', () => {
    expect(parsePnpmWorkspacePackages('catalog:\n  vitest: ^3.0.0\n')).toEqual([]);
  });
});
