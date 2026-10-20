# Using `pnpm link` for Local SDK Testing

[`pnpm link`](https://pnpm.io/cli/link) symlinks a local SDK package into a test project. Changes are available in the
test project after a rebuild, without a publish step. For packages where linking causes problems (e.g. SvelteKit or
Angular), use [`yalc`](./using-yalc.md) instead.

## Building packages

Build the SDK package and the packages it depends on. Run this in the root of the repo:

```sh
pnpm run build:dev:filter @sentry/node # or any other SDK package
```

## Linking packages

In your test project, run `pnpm link` with the path to the SDK package:

```sh
pnpm link /path/to/sentry-javascript/packages/node
```

You only need to link the SDK package that your project imports. Its dependencies (e.g. `@sentry/core`) resolve from
the monorepo, so they are also the local versions. If your project also imports a dependency directly (e.g.
`@sentry/core`), that import still uses the version from the registry. Link that package too.

`pnpm link` adds a `link:` override to the `pnpm-workspace.yaml` of your test project. If the file does not exist,
`pnpm link` creates it. Do not commit this override.

## Updating packages

The link points to the `build/` folder of the package. After a code change, rebuild the package and restart your test
project. You do not need to link again.

```sh
# in the package you changed, e.g. packages/core
pnpm run build:transpile
```

## Unlinking packages

In your test project, run `pnpm unlink` with the package name. This removes the `link:` override and installs the
registry version again.

```sh
pnpm unlink @sentry/node
```

In pnpm 10, `pnpm unlink` shows "Nothing to unlink" and does not remove the override. Remove the override
for the package from `pnpm-workspace.yaml` manually, then run `pnpm install`.

## Troubleshooting

### My test project still uses the registry version

Make sure that `node_modules/@sentry/node` in your test project is a symlink to the monorepo:

```sh
ls -la node_modules/@sentry/node
```

If you run Node.js or your bundler with `--preserve-symlinks`, dependencies resolve from the `node_modules` of your
test project and not from the monorepo. Do not use this flag.

### My test project uses Vite and I still don't see changes

Vite pre-bundles and caches dependencies for dev builds. Run `vite dev --force` to clear the cache.
