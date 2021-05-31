import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { deepReadDirSync } from '../src/utils';

// The parent directory for the new temporary directory

describe('deepReadDirSync', () => {
  it('handles nested files', () => {
    // compare sets so that order doesn't matter
    expect(new Set(deepReadDirSync('./test/fixtures/testDeepReadDirSync'))).toEqual(
      new Set([
        // root level
        'debra.txt',
        // one level deep
        'cats/eddy.txt',
        'cats/persephone.txt',
        'cats/piper.txt',
        'cats/sassafras.txt',
        'cats/teaberry.txt',
        // two levels deep
        'dogs/theBigs/charlie.txt',
        'dogs/theBigs/maisey.txt',
        'dogs/theSmalls/bodhi.txt',
        'dogs/theSmalls/cory.txt',
      ]),
    );
  });

  it('handles empty target directory', (done: (error?: Error) => void) => {
    expect.assertions(1);
    const tmpDir = os.tmpdir();

    fs.mkdtemp(`${tmpDir}${path.sep}`, (err, dirPath) => {
      if (err) throw err;
      try {
        expect(deepReadDirSync(dirPath)).toEqual([]);
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('errors if directory does not exist', () => {
    expect(() => deepReadDirSync('./IDontExist')).toThrowError('Directory does not exist.');
  });

  it('errors if given path is not a directory', () => {
    expect(() => deepReadDirSync('package.json')).toThrowError('it is not a directory');
  });
});
