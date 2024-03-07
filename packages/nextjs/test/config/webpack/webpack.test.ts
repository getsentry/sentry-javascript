import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getUserConfigFile } from '../../../src/config/webpack';
import { exitsSync, mkdtempSyncSpy, mockExistsSync, realExistsSync } from '../mocks';

describe('getUserConfigFile', () => {
  let tempDir: string;

  beforeAll(() => {
    exitsSync.mockImplementation(realExistsSync);
  });

  beforeEach(() => {
    // these will get cleaned up by the file's overall `afterAll` function, and the `mkdtempSync` mock above ensures
    // that the location of the created folder is stored in `tempDir`
    const tempDirPathPrefix = path.join(os.tmpdir(), 'sentry-nextjs-test-');
    fs.mkdtempSync(tempDirPathPrefix);
    tempDir = mkdtempSyncSpy.mock.results[0].value;
  });

  afterAll(() => {
    exitsSync.mockImplementation(mockExistsSync);
  });

  it('successfully finds js files', () => {
    fs.writeFileSync(path.resolve(tempDir, 'sentry.server.config.js'), 'Dogs are great!');
    fs.writeFileSync(path.resolve(tempDir, 'sentry.client.config.js'), 'Squirrel!');

    expect(getUserConfigFile(tempDir, 'server')).toEqual('sentry.server.config.js');
    expect(getUserConfigFile(tempDir, 'client')).toEqual('sentry.client.config.js');
  });

  it('successfully finds ts files', () => {
    fs.writeFileSync(path.resolve(tempDir, 'sentry.server.config.ts'), 'Sit. Stay. Lie Down.');
    fs.writeFileSync(path.resolve(tempDir, 'sentry.client.config.ts'), 'Good dog!');

    expect(getUserConfigFile(tempDir, 'server')).toEqual('sentry.server.config.ts');
    expect(getUserConfigFile(tempDir, 'client')).toEqual('sentry.client.config.ts');
  });

  it('errors when files are missing', () => {
    expect(() => getUserConfigFile(tempDir, 'server')).toThrowError(
      `Cannot find 'sentry.server.config.ts' or 'sentry.server.config.js' in '${tempDir}'`,
    );
    expect(() => getUserConfigFile(tempDir, 'client')).toThrowError(
      `Cannot find 'sentry.client.config.ts' or 'sentry.client.config.js' in '${tempDir}'`,
    );
  });
});
