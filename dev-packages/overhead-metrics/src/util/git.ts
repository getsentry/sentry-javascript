import { simpleGit } from 'simple-git';

export type GitHash = string;
const git = simpleGit();

async function defaultBranch(): Promise<string> {
  const remoteInfo = (await git.remote(['show', 'origin'])) as string;
  for (let line of remoteInfo.split('\n')) {
    line = line.trim();
    if (line.startsWith('HEAD branch:')) {
      return line.substring('HEAD branch:'.length).trim();
    }
  }
  throw "Couldn't find base branch name";
}

export const Git = {
  get repository(): Promise<string> {
    return (async () => {
      if (typeof process.env.GITHUB_REPOSITORY == 'string' && process.env.GITHUB_REPOSITORY.length > 0) {
        return `github.com/${process.env.GITHUB_REPOSITORY}`;
      } else {
        let url = (await git.remote(['get-url', 'origin'])) as string;
        url = url.trim();
        url = url.replace(/^git@/, '');
        url = url.replace(/\.git$/, '');
        return url.replace(':', '/');
      }
    })();
  },

  get branch(): Promise<string> {
    return (async () => {
      if (typeof process.env.GITHUB_HEAD_REF == 'string' && process.env.GITHUB_HEAD_REF.length > 0) {
        return process.env.GITHUB_HEAD_REF;
      } else if (typeof process.env.GITHUB_REF == 'string' && process.env.GITHUB_REF.startsWith('refs/heads/')) {
        return process.env.GITHUB_REF.substring('refs/heads/'.length);
      } else {
        const branches = (await git.branchLocal()).branches;
        for (const name in branches) {
          if (branches[name].current) return name;
        }
        throw "Couldn't find current branch name";
      }
    })();
  },

  get baseBranch(): Promise<string> {
    if (typeof process.env.GITHUB_BASE_REF == 'string' && process.env.GITHUB_BASE_REF.length > 0) {
      return Promise.resolve(process.env.GITHUB_BASE_REF);
    } else {
      return defaultBranch();
    }
  },

  get branchIsBase(): Promise<boolean> {
    return (async () => {
      const branch = await this.branch;
      const baseBranch = await this.baseBranch;

      return branch === baseBranch;
    })();
  },

  get hash(): Promise<GitHash> {
    return (async () => {
      let gitHash = await git.revparse('HEAD');
      const diff = await git.diff();
      if (diff.trim().length > 0) {
        gitHash += '+dirty';
      }
      return gitHash;
    })();
  },
};
