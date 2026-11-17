import { describe, expect, it } from 'vitest';

import { getOwnersForFiles, parseCodeowners } from './assign-reviewers.mjs';

const CODEOWNERS = `
# comment
/packages/browser/      @getsentry/browser
/packages/node/         @getsentry/server
/packages/node/src/x.ts @someone
*.md                    @getsentry/docs
+/packages/node/src/ai/ @ai-expert
+/packages/core/src/ai/ @ai-expert
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

  it('adds the owners of `+` rules on top of the winning rule', () => {
    expect(getOwnersForFiles(rules, ['packages/node/src/ai/openai.ts'])).toEqual(['@getsentry/server', '@ai-expert']);
  });

  it('does not let a later `+` rule replace the winning rule', () => {
    expect(getOwnersForFiles(rules, ['packages/node/src/ai/README.md'])).toEqual(['@getsentry/docs', '@ai-expert']);
  });

  it('uses only the `+` rule owners when no other rule matches', () => {
    expect(getOwnersForFiles(rules, ['packages/core/src/ai/utils.ts'])).toEqual(['@ai-expert']);
  });

  it('does not match sibling directories that share a prefix', () => {
    expect(getOwnersForFiles(rules, ['packages/browser-utils/src/index.ts', 'packages/nodejs/a.ts'])).toEqual([]);
  });
});
