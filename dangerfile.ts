import { danger, warn } from 'danger';

export default async () => {
  if (!danger.github) {
    return;
  }

  const hasChangelog = danger.git.modified_files.indexOf('CHANGELOG.md') !== -1;
  const isTrivial = (danger.github.pr.body + danger.github.pr.title).includes('#trivial');

  if (!hasChangelog && !isTrivial) {
    warn('Please add a changelog entry for your changes.');
  }
};
