import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasSourceMapUploadCredentials } from '../../src/core/upload-credentials';

describe('hasSourceMapUploadCredentials', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-upload-credentials-'));
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    vi.stubEnv('SENTRY_AUTH_TOKEN', '');
    vi.stubEnv('SENTRY_ORG', '');
    vi.stubEnv('SENTRY_PROJECT', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('returns true with an auth token, org and project in the options', () => {
    expect(hasSourceMapUploadCredentials({ authToken: 'token', org: 'org', project: 'project' })).toBe(true);
  });

  it.each([
    ['auth token', { org: 'org', project: 'project' }],
    ['org', { authToken: 'token', project: 'project' }],
    ['project', { authToken: 'token', org: 'org' }],
    ['project in the list', { authToken: 'token', org: 'org', project: [] }],
  ])('returns false without an %s', (_, options) => {
    expect(hasSourceMapUploadCredentials(options)).toBe(false);
  });

  it('returns false without options', () => {
    expect(hasSourceMapUploadCredentials(undefined)).toBe(false);
  });

  it('accepts an org token without an org', () => {
    expect(hasSourceMapUploadCredentials({ authToken: 'sntrys_token', project: 'project' })).toBe(true);
  });

  it('reads the environment variables', () => {
    vi.stubEnv('SENTRY_AUTH_TOKEN', 'token');
    vi.stubEnv('SENTRY_ORG', 'org');
    vi.stubEnv('SENTRY_PROJECT', 'project1,project2');

    expect(hasSourceMapUploadCredentials({})).toBe(true);
  });

  it('reads `.env.sentry-build-plugin` before the plugin loads it', () => {
    fs.writeFileSync(
      path.join(cwd, '.env.sentry-build-plugin'),
      'SENTRY_AUTH_TOKEN=token\nSENTRY_ORG=org\nSENTRY_PROJECT=project\n',
    );

    expect(hasSourceMapUploadCredentials({})).toBe(true);
    expect(process.env.SENTRY_AUTH_TOKEN).toBe('');
  });

  it('prefers the options over the environment', () => {
    vi.stubEnv('SENTRY_AUTH_TOKEN', 'token');
    vi.stubEnv('SENTRY_ORG', 'org');
    vi.stubEnv('SENTRY_PROJECT', 'project');

    expect(hasSourceMapUploadCredentials({ project: [] })).toBe(false);
  });
});
