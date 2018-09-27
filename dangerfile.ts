import { exec } from 'child_process';
import { danger, message, schedule, warn } from 'danger';
import { promisify } from 'util';
import { resolve } from 'path';
import tslint from 'danger-plugin-tslint';

const packages = ['browser', 'core', 'hub', 'minimal', 'node', 'types', 'utils'];

export default async () => {
  if (!danger.github) {
    return;
  }

  packages.map(packageName => {
    tslint({
      lintResultsJsonPath: resolve(__dirname, 'packages', packageName, 'lint-results.json'),
    });
  });

  const hasChangelog = danger.git.modified_files.indexOf('CHANGELOG.md') !== -1;
  const isTrivial = (danger.github.pr.body + danger.github.pr.title).includes('#trivial');

  if (!hasChangelog && !isTrivial) {
    warn('Please add a changelog entry for your changes.');
  }

  schedule(async () => {
    const result = (await promisify(exec)('cd packages/browser; yarn size:check')).stdout;
    message(`@sentry/browser gzip minified size: ${result.split('\n')[1]}`);
  });
};
