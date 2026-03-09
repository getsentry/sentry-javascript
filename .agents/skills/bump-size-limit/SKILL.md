---
name: bump-size-limit
description: Bump size limits in .size-limit.js when the size-limit CI check is failing. Use when the user mentions size limit failures, bundle size checks failing, CI size check errors, or needs to update size-limit thresholds. Also use when the user says "bumpSizeLimit", "fix size limit", "size check failing", or "update bundle size limits".
---

# Bump Size Limit

When the size-limit GitHub Action fails, it means one or more bundle scenarios exceed their configured byte thresholds in `.size-limit.js`. This skill walks through building, measuring, and bumping only the limits that need it.

## Workflow

### Step 1: Build all packages (including CDN bundles)

A full build is required because size-limit measures the actual compiled artifacts.

```bash
yarn build
```

This takes a few minutes. CDN bundles in `packages/browser/build/bundles/` must be up to date — a dev build is not sufficient.

### Step 2: Run the size check in JSON mode

```bash
yarn test:size-limit
```

The JSON output is an array of objects. Each object has:

- `name` — the scenario label
- `passed` — whether it's within the limit
- `size` — actual size in bytes
- `sizeLimit` — configured limit in bytes

### Step 3: Identify failed scenarios

Filter for entries where `"passed": false`. These are the only ones that need bumping.

### Step 4: Calculate new limits

For each failed scenario, round the actual size **up to the next full KB** (1 KB = 1000 bytes in this context, matching how size-limit interprets the limits in `.size-limit.js`).

**Example:** If actual size is `129,127` bytes, the new limit is `130 KB` (i.e. 130,000 bytes).

The heuristic is intentionally conservative — it gives just enough headroom without inflating limits unnecessarily.

### Step 5: Update `.size-limit.js`

Open `.size-limit.js` at the repository root and update the `limit` field for each failed scenario. Limits are strings like `'130 KB'`.

Only change limits for scenarios that actually failed. Do not touch passing scenarios.

### Step 6: Verify the fix

Re-run size-limit to confirm everything passes:

```bash
yarn test:size-limit
```

If any scenario still fails (e.g., due to rounding edge cases), bump that specific limit by another 1 KB and re-run.
