import { exec } from 'child_process';
import { danger, fail, message, schedule, warn } from 'danger';
import { promisify } from 'util';
import { resolve } from 'path';
import tslint from 'danger-plugin-tslint';
import { prettyResults } from 'danger-plugin-tslint/dist/prettyResults';

const packages = ['browser', 'core', 'hub', 'integrations', 'minimal', 'node', 'types', 'utils'];

export default async () => {
  if (!danger.github) {
    return;
  }

  schedule(async () => {
    const tsLintResult = (await Promise.all(
      packages.map(packageName => {
        return new Promise<string>(res => {
          tslint({
            lintResultsJsonPath: resolve(__dirname, 'packages', packageName, 'lint-results.json'),
            handleResults: results => {
              if (results.length > 0) {
                const formattedResults = prettyResults(results);
                res(`TSLint failed: **@sentry/${packageName}**\n\n${formattedResults}`);
              } else {
                res('');
              }
            },
          });
        });
      }),
    )).filter(str => str.length);
    if (tsLintResult.length) {
      tsLintResult.forEach(tsLintFail => {
        fail(`${tsLintFail}`);
      });
    } else {
      message('✅ TSLint passed');
    }
  });

  const hasChangelog = danger.git.modified_files.indexOf('CHANGELOG.md') !== -1;
  const isTrivial = (danger.github.pr.body + danger.github.pr.title).includes('#trivial');

  if (!hasChangelog && !isTrivial) {
    warn('Please add a changelog entry for your changes.');
  }

  schedule(async () => {
    const result = (await promisify(exec)('cd packages/browser; yarn size:check')).stdout;
    message(`@sentry/browser gzip'ed minified size: ${result.split('\n')[1]}`);
  });
};
