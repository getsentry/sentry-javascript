/* eslint-disable no-console */
import * as fs from 'fs';
import * as path from 'path';
import * as rimraf from 'rimraf';

/*
 * This script is used to sync the source files from @sentry/angular to @sentry/angular-ivy.
 * Because @sentry/angular-ivy only differs from @sentry/angular in the way it is built, we
 * want to keep source files in sync to avoid having to maintain the same source files twice.
 * This file is run before we actually build @sentry/angular-ivy, so that the symlinks are
 * always up to date.
 */

console.log('------------------------------------------------------------');
console.log('Syncing @sentry/angular and @sentry/angular-ivy source files');

const ANGULAR_PATH = path.resolve(__dirname, '..', '..', 'angular');
const ANGULAR_IVY_PATH = path.resolve(__dirname, '..');

const angularSrcPath = path.resolve(ANGULAR_PATH, 'src');
const angularIvySrcPath = path.resolve(ANGULAR_IVY_PATH, 'src');

const angularIvySrcDirContent = fs.readdirSync(angularIvySrcPath);
angularIvySrcDirContent.forEach(entry => {
  if (entry !== 'sdk.ts') {
    rimraf.sync(path.resolve(angularIvySrcPath.toString(), entry));
  }
});

syncDir(angularSrcPath, angularIvySrcPath);

console.log('------------------------------------------------------------');

function syncDir(srcDir: fs.PathLike, targetDir: fs.PathLike): void {
  const srcDirContent = fs.readdirSync(srcDir, { withFileTypes: true }).filter(file => file.name !== 'sdk.ts');
  srcDirContent.forEach(entry => {
    if (entry.isDirectory()) {
      const newTargetDir = path.resolve(targetDir.toString(), entry.name);
      if (!fs.existsSync(newTargetDir)) {
        fs.mkdirSync(newTargetDir);
      }
      return syncDir(path.resolve(srcDir.toString(), entry.name), newTargetDir);
    }

    const relativeSourceFilePath = path.relative(process.cwd(), path.resolve(srcDir.toString(), entry.name));
    const relativeTargetFilePath = path.relative(process.cwd(), path.resolve(targetDir.toString(), entry.name));

    console.log(`Syncing ${relativeSourceFilePath} to ${relativeTargetFilePath}`);

    fs.symlinkSync(path.join('..', relativeSourceFilePath), relativeTargetFilePath, 'file');
  });
}
