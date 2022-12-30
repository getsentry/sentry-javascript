import { simpleGit } from 'simple-git';

export type GitHash = string;

// A testing scenario we want to collect metrics for.
export const Git = {
  get hash(): Promise<GitHash> {
    return (async () => {
      const git = simpleGit();
      let gitHash = await git.revparse('HEAD');
      let diff = await git.diff();
      if (diff.trim().length > 0) {
        gitHash += '+dirty';
      }
      return gitHash;
    })();
  }
}
