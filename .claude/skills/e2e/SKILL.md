---
name: e2e
description: Run E2E tests for Sentry JavaScript SDK test applications
argument-hint: <test-app-name> [--variant <variant-name>]
---

# E2E Test Runner Skill

This skill runs end-to-end tests for Sentry JavaScript SDK test applications. It ensures SDK packages are built before running tests.

## Input

The user provides a test application name and optionally a variant:

- `e2e-tests/test-applications/nextjs-app-dir` (full path)
- `nextjs-app-dir` (just the app name)
- `nextjs-app-dir --variant nextjs-15` (with variant)

## Workflow

### Step 1: Parse the Test Application Name

Extract the test app name from user input:

- Strip `e2e-tests/test-applications/` prefix if present
- Extract variant flag if provided (e.g., `--variant nextjs-15`)
- Store the clean app name (e.g., `nextjs-app-dir`)

### Step 2: Determine Which Packages Need Rebuilding

If the user recently edited files in `packages/*`, identify which packages were modified:

```bash
# Check which packages have uncommitted changes (including untracked files)
git status --porcelain | grep "^[ MARC?][ MD?] packages/" | cut -d'/' -f2 | sort -u
```

For each modified package, rebuild its tarball:

```bash
cd packages/<package-name>
yarn build && yarn build:tarball
cd ../..
```

**Option C: User Specifies Packages**

If the user says "I changed @sentry/node" or similar, rebuild just that package:

```bash
cd packages/node
yarn build && yarn build:tarball
cd ../..
```

### Step 3: Verify Test Application Exists

Check that the test app exists:

```bash
ls -d dev-packages/e2e-tests/test-applications/<app-name>
```

If it doesn't exist, list available test apps:

```bash
ls dev-packages/e2e-tests/test-applications/
```

Ask the user which one they meant.

### Step 4: Run the E2E Test

Navigate to the e2e-tests directory and run the test:

```bash
cd dev-packages/e2e-tests
yarn test:run <app-name>
```

If a variant was specified:

```bash
cd dev-packages/e2e-tests
yarn test:run <app-name> --variant <variant-name>
```

### Step 5: Report Results

After the test completes, provide a summary:

**If tests passed:**

```
✅ E2E tests passed for <app-name>

All tests completed successfully. Your SDK changes work correctly with this test application.
```

**If tests failed:**

```
❌ E2E tests failed for <app-name>

[Include relevant error output]
```

**If package rebuild was needed:**

```
📦 Rebuilt SDK packages: <list of packages>
🧪 Running E2E tests for <app-name>...
```

## Error Handling

- **No tarballs found**: Run `yarn build && yarn build:tarball` at repository root
- **Test app not found**: List available apps and ask user to clarify
- **Verdaccio not running**: Tests should start Verdaccio automatically, but if issues occur, check Docker
- **Build failures**: Fix build errors before running tests

## Common Test Applications

Here are frequently tested applications:

- `nextjs-app-dir` - Next.js App Router
- `nextjs-15` - Next.js 15.x
- `react-create-hash-router` - React with React Router
- `node-express-esm-loader` - Node.js Express with ESM
- `sveltekit-2` - SvelteKit 2.x
- `remix-2` - Remix 2.x
- `nuxt-3` - Nuxt 3.x

To see all available test apps:

```bash
ls dev-packages/e2e-tests/test-applications/
```

## Example Workflows

### Example 1: After modifying @sentry/node

```bash
# User: "Run e2e tests for node-express-esm-loader"

# Step 1: Detect recent changes to packages/node
# Step 2: Rebuild the modified package
cd packages/node
yarn build && yarn build:tarball
cd ../..

# Step 3: Run the test
cd dev-packages/e2e-tests
yarn test:run node-express-esm-loader
```

### Example 2: First-time test run

```bash
# User: "Run e2e tests for nextjs-app-dir"

# Step 1: Check for existing tarballs
# Step 2: None found, build all packages
yarn build && yarn build:tarball

# Step 3: Run the test
cd dev-packages/e2e-tests
yarn test:run nextjs-app-dir
```

### Example 3: With variant

```bash
# User: "Run e2e tests for nextjs-app-dir with nextjs-15 variant"

# Step 1: Rebuild if needed
# Step 2: Run with variant
cd dev-packages/e2e-tests
yarn test:run nextjs-app-dir --variant nextjs-15
```

## Tips

- **Always rebuild after SDK changes**: Tarballs contain the compiled SDK code
- **Watch build output**: Build errors must be fixed before testing

## Integration with Development Workflow

This skill integrates with the standard SDK development workflow:

1. Make changes to SDK code in `packages/*`
2. Run `/e2e <app-name>` to test your changes
3. Fix any test failures

The skill automates the tedious parts of:

- Remembering to rebuild tarballs
- Navigating to the correct directory
- Running tests with the right flags
