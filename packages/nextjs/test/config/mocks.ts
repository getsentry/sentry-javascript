// TODO: This mocking is why we have to use `--runInBand` when we run tests, since there's only a single temp directory
// created

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as rimraf from 'rimraf';

import { CLIENT_SDK_CONFIG_FILE, SERVER_SDK_CONFIG_FILE } from './fixtures';

// We use `fs.existsSync()` in `getUserConfigFile()`. When we're not testing `getUserConfigFile()` specifically, all we
// need is for it to give us any valid answer, so make it always find what it's looking for. Since this is a core node
// built-in, though, which jest itself uses, otherwise let it do the normal thing. Storing the real version of the
// function also lets us restore the original when we do want to test `getUserConfigFile()`.
export const realExistsSync = jest.requireActual('fs').existsSync;
export const mockExistsSync = (path: fs.PathLike): ReturnType<typeof realExistsSync> => {
  if ((path as string).endsWith(SERVER_SDK_CONFIG_FILE) || (path as string).endsWith(CLIENT_SDK_CONFIG_FILE)) {
    return true;
  }

  return realExistsSync(path);
};
export const exitsSync = jest.spyOn(fs, 'existsSync').mockImplementation(mockExistsSync);

/** Mocking of temporary directory creation (so that we have a place to stick files (like `sentry.client.config.js`) in
 * order to test that we can find them) */

// Make it so that all temporary folders, either created directly by tests or by the code they're testing, will go into
// one spot that we know about, which we can then clean up when we're done
const realTmpdir = jest.requireActual('os').tmpdir;

// Including the random number ensures that even if multiple test files using these mocks are running at once, they have
// separate temporary folders
const TEMP_DIR_PATH = path.join(realTmpdir(), `sentry-nextjs-test-${Math.random()}`);

jest.spyOn(os, 'tmpdir').mockReturnValue(TEMP_DIR_PATH);
// In theory, we should always land in the `else` here, but this saves the cases where the prior run got interrupted and
// the `afterAll` below didn't happen.
if (fs.existsSync(TEMP_DIR_PATH)) {
  rimraf.sync(path.join(TEMP_DIR_PATH, '*'));
} else {
  fs.mkdirSync(TEMP_DIR_PATH);
}

afterAll(() => {
  rimraf.sync(TEMP_DIR_PATH);
});

// In order to know what to expect in the webpack config `entry` property, we need to know the path of the temporary
// directory created when doing the file injection, so wrap the real `mkdtempSync` and store the resulting path where we
// can access it
export const mkdtempSyncSpy = jest.spyOn(fs, 'mkdtempSync');

afterEach(() => {
  mkdtempSyncSpy.mockClear();
});

// TODO (v8): This shouldn't be necessary once `hideSourceMaps` gets a default value, even for the updated error message
// eslint-disable-next-line @typescript-eslint/unbound-method
const realConsoleWarn = global.console.warn;
global.console.warn = (...args: unknown[]) => {
  // Suppress the warning message about the `hideSourceMaps` option. This is better than forcing a value for
  // `hideSourceMaps` because that would mean we couldn't test it easily and would muddy the waters of other tests. Note
  // that doing this here, as a side effect, only works because the tests which trigger this warning are the same tests
  // which need other mocks from this file.
  if (typeof args[0] === 'string' && args[0].includes('your original code may be visible in browser devtools')) {
    return;
  }

  return realConsoleWarn(...args);
};
