import { exec } from 'child_process';
import { danger, fail, message, schedule, warn } from 'danger';
import { CLIEngine } from 'eslint';
import { promisify } from 'util';

const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];

/**
 * Eslint your code with Danger
 * Based on fork from: https://github.com/appcelerator/danger-plugin-eslint
 */
async function eslint(): Promise<void[]> {
  const allFiles = danger.git.created_files.concat(danger.git.modified_files);
  // eslint-disable-next-line deprecation/deprecation
  const cli = new CLIEngine({});
  // let eslint filter down to non-ignored, matching the extensions expected
  const filesToLint = allFiles.filter(f => !cli.isPathIgnored(f) && EXTENSIONS.some(ext => f.endsWith(ext)));
  return Promise.all(filesToLint.map(f => lintFile(cli, f)));
}

/** JSDoc */
// eslint-disable-next-line deprecation/deprecation
async function lintFile(linter: CLIEngine, path: string): Promise<void> {
  const contents = await danger.github.utils.fileContents(path);
  const report = linter.executeOnText(contents, path);

  if (report.results.length !== 0) {
    report.results[0].messages.map(msg => {
      if (msg.fatal) {
        fail(`Fatal error linting ${path} with eslint.`);
        return;
      }

      const noop = (): void => undefined;
      const fn = { 0: noop, 1: warn, 2: fail }[msg.severity];

      fn(`${path} line ${msg.line} – ${msg.message} (${msg.ruleId})`, path, msg.line);
    });
  }
}

export default async (): Promise<void> => {
  if (!danger.github) {
    return;
  }

  await eslint();

  const hasChangelog = danger.git.modified_files.indexOf('CHANGELOG.md') !== -1;
  const isTrivial = (danger.github.pr.body + danger.github.pr.title).includes('#trivial');

  if (!hasChangelog && !isTrivial) {
    warn('Please add a changelog entry for your changes.');
  }

  schedule(async () => {
    const lines = (await promisify(exec)('cd packages/browser; yarn size:check')).stdout.split('\n');
    const es5size = lines.find(v => v.startsWith('ES5'));
    const es6size = lines.find(v => v.startsWith('ES6'));
    message(`@sentry/browser bundle gzip'ed minified size: *(${es5size}) (${es6size})*`);
  });
};
