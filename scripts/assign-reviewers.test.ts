import { describe, expect, it } from 'vitest';

const { getOwnersForFiles, parseCodeowners, pickReviewers } = require('./assign-reviewers');

const CODEOWNERS = `
# comment
/packages/browser/      @getsentry/browser
/packages/node/         @getsentry/server
/packages/node/src/x.ts @someone
*.md                    @getsentry/docs
`;

describe('getOwnersForFiles', () => {
  const rules = parseCodeowners(CODEOWNERS);

  it('collects owners across all touched files', () => {
    expect(getOwnersForFiles(rules, ['packages/browser/src/index.ts', 'packages/node/src/sdk.ts'])).toEqual([
      '@getsentry/browser',
      '@getsentry/server',
    ]);
  });

  it('uses the last matching rule for a file', () => {
    expect(getOwnersForFiles(rules, ['packages/node/src/x.ts'])).toEqual(['@someone']);
  });

  it('matches unanchored patterns at any depth', () => {
    expect(getOwnersForFiles(rules, ['packages/node/README.md'])).toEqual(['@getsentry/docs']);
  });

  it('does not match sibling directories that share a prefix', () => {
    expect(getOwnersForFiles(rules, ['packages/browser-utils/src/index.ts', 'packages/nodejs/a.ts'])).toEqual([]);
  });
});

describe('pickReviewers', () => {
  const teamPool = ['a', 'b', 'c', 'd', 'e', 'mydea'];

  it('picks only from the codeowner pool when it is large enough', () => {
    const picked = pickReviewers({
      existing: [],
      codeownerPool: ['x1', 'x2', 'x3', 'y1', 'y2', 'y3'],
      teamPool,
      exclude: [],
    });
    expect(picked).toHaveLength(3);
    picked.forEach((login: string) => expect(['x1', 'x2', 'x3', 'y1', 'y2', 'y3']).toContain(login));
  });

  it('fills up from the team when the codeowner pool is too small', () => {
    const picked = pickReviewers({ existing: [], codeownerPool: ['x1'], teamPool, exclude: ['mydea'] });
    expect(picked).toHaveLength(3);
    expect(picked[0]).toBe('x1');
    expect(picked).not.toContain('mydea');
  });

  it('picks from the whole team when no codeowners match', () => {
    const picked = pickReviewers({ existing: [], codeownerPool: [], teamPool: ['a', 'b', 'c'], exclude: [] });
    expect(picked.sort()).toEqual(['a', 'b', 'c']);
  });

  it('never picks the author, excluded people, or existing reviewers, case-insensitively', () => {
    const picked = pickReviewers({
      existing: ['B'],
      codeownerPool: ['A', 'b', 'Mydea'],
      teamPool: ['a', 'c', 'd'],
      exclude: ['a', 'mydea'],
    });
    expect(picked.sort()).toEqual(['c', 'd']);
  });

  it('only tops up to the required number of reviewers', () => {
    expect(pickReviewers({ existing: ['x', 'y'], codeownerPool: [], teamPool, exclude: [] })).toHaveLength(1);
    expect(pickReviewers({ existing: ['x', 'y', 'z'], codeownerPool: [], teamPool, exclude: [] })).toEqual([]);
  });

  it('returns fewer reviewers when not enough people are eligible', () => {
    expect(pickReviewers({ existing: [], codeownerPool: [], teamPool: ['a'], exclude: [] })).toEqual(['a']);
  });
});
