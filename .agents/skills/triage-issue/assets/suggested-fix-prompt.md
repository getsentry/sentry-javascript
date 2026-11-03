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
1. pnpm run build:dev
2. pnpm run lint
3. pnpm run test (in the affected package directory)
```
