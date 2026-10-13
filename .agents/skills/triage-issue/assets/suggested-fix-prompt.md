### Suggested Fix

Complexity: <trivial|moderate|complex>

To apply this fix, run the following prompt in Claude Code:

```
Fix GitHub issue #<number> (<title>).

Root cause: <brief explanation>

Changes needed:
- In `packages/<pkg>/src/<file>.ts`: <what to change>
- In `packages/<pkg>/test/<file>.test.ts`: <test updates if needed>

After making changes, run:
1. pnpm build:dev
2. pnpm lint
3. pnpm test (in the affected package directory)
```
