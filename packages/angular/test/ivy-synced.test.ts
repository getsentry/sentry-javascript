import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';

describe('@sentry/angular-ivy', () => {
  /*
   * This test ensures that the source files in @sentry/angular-ivy are in sync with @sentry/angular.
   * If this test fails, run `yarn build` in `packages/angular-ivy` to update the sym-linked files.
   */
  test('ivy source files should be sym-linked and in sync with @sentry/angular', () => {
    const angularBaseDir = path.resolve(__dirname, '..');
    const angularIvyBaseDir = path.resolve(__dirname, '..', '..', 'angular-ivy');

    const angularSourceFilePaths = glob.sync(path.join(angularBaseDir, 'src', '**', '*'));
    const angularIvySourceFilePaths = glob.sync(path.join(angularIvyBaseDir, 'src', '**', '*'));

    const angularSourceFiles = angularSourceFilePaths.map(filePath => path.relative(angularBaseDir, filePath));
    const angularIvySourceFiles = angularIvySourceFilePaths.map(filePath => path.relative(angularIvyBaseDir, filePath));

    // shallow equality check
    expect(angularSourceFiles).toStrictEqual(angularIvySourceFiles);

    // all files in angular-ivy should be sym-linked except for sdk.ts
    angularIvySourceFilePaths
      .filter(filePath => path.relative(angularIvyBaseDir, filePath) !== path.join('src', 'sdk.ts'))
      .forEach(ivyFilePath => {
        expect(fs.lstatSync(ivyFilePath).isSymbolicLink()).toBe(true);
        expect(angularSourceFilePaths).toContain(fs.realpathSync(ivyFilePath));
      });
  });
});
