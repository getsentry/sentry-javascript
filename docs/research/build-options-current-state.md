# Build-time source map options: what happens today

Research date: 2026-11-14. Read only: no source changes. This document states what the code on `develop` does now. It makes no proposal.

## TL;DR

The 16 places where the result differs most from what a user would expect, worst first. "Where" names the affected SDK paths. The number in brackets is the section with the detail. Where an open PR fixes the issue, the PR is linked.

1. **You turn source maps off, and Sentry turns them on anyway.** A falsy `devtool` is replaced. Where: Next.js with webpack, Gatsby. (3.2)
2. **The SDK's cleanup glob misses maps, so source maps stay in the build output.** Astro with a custom `outDir`: fixed by [#26334]. SolidStart 2 without an auth token, where the client maps stay in `.output/public`: fixed by [#26335]. TanStack Start on Vite 7, for the server maps: fixed by [#26336]. Nuxt with `server.builder: 'vite'`: fixed by [#26338]. (3.3)
3. **`sourcemaps.disable: true` still generates source maps.** SvelteKit turns hidden maps on and then deletes them. React Router turns them on and leaves them in the build output. (3.2, 3.3)
4. **`sourcemaps.disable: true` also turns off features that are not about source maps.** The whole Sentry plugin is not added, so release injection, release creation, `bundleSizeOptimizations`, `applicationKey` and `moduleMetadata` stop with no warning. Where: Astro, Nuxt, SolidStart. (3.4)
5. **Source maps you turned on yourself are deleted by default.** Where: React Router (every `.map` file in the build directory), Next.js with webpack (every client map). All other SDKs keep them. (3.3)
6. **`disable: 'disable-upload'` leaves nothing to upload.** The option is for a manual upload later. The SDK turns maps on, the plugin stamps debug IDs into them, and the SDK's glob deletes them. Where: Nuxt client, Nuxt server, Astro, SvelteKit, SolidStart 1. (3.3)
7. **Maps are deleted when nothing was uploaded.** Without an auth token, every SDK turns hidden maps on and deletes them again. React Router and the Remix CLI script also delete the maps after a failed upload. `filesToDeleteAfterUpload` runs after every build, with or without an upload. (3.3, 5)
8. **The SDK's cleanup glob deletes maps that are not Sentry's.** SolidStart 1 deletes every `.map` file in every top-level dot folder: fixed by [#26335]. Nuxt deletes every `.map` file in the public folder, also those from your `public/` folder: fixed by [#26338]. Remix, Astro and Gatsby delete `.map` files that were copied into the output: fixed by [#26332], [#26334] and [#26333]. (3.3)
9. **Next.js on Turbopack can leave public source maps in the output.** The SDK sets `productionBrowserSourceMaps = true`. With `useRunAfterProductionCompileHook: false`, no step uploads or deletes them. (evidence: `nextjs-gatsby.md`, Surprises 8)
10. **SvelteKit `autoUploadSourceMaps: false` can still upload.** If `bundleSizeOptimizations` is set, the plugin exists, the SDK turns hidden maps on, and the upload runs when the `SENTRY_*` environment variables are set. (2.2)
11. **A default Nuxt app uploads no client source maps.** Nuxt's own default is `sourcemap.client: false`, and the SDK treats that as your choice. (3.1)
12. **The Bun plugin can do nothing, with no warning.** With Bun's `sourcemap` unset it adds no debug IDs and uploads nothing. (3.2, 4)
13. **Options are accepted and then ignored.** `rewriteSources`: Next.js on Turbopack, Nitro, React Router. `resolveSourceMap`: every chunk on the staged route. `assets` and `ignore`: React Router. `applicationKey` and `moduleMetadata`: Nitro. `moduleMetadata`, and `applicationKey` below Next.js 16: Next.js on Turbopack. `release.create: false`: the React Router build end step still creates the release. (2.1, 2.2)
14. **Your `filesToDeleteAfterUpload` glob does not always replace Sentry's deletion.** It replaces the SDK's default glob in every SDK that has the option. But in Remix, SolidStart and TanStack Start the plugin itself still removes the client maps when an upload runs. In Next.js with webpack and the after-compile hook, your glob runs before the upload. (2.1, 3.3)
15. **`assets` is a list of globs in most places and a list of folders in two.** Where folders: Next.js on Turbopack or with the after-compile hook, Nitro. (2.1, 4)
16. **Deleted maps leave their `sourceMappingURL` comments behind.** With visible maps, the glob deletes the map and the comment in the bundle stays, so browsers request a file that is gone. Where: Next.js with webpack, fixed by [#26337]. Gatsby, fixed by [#26333]. (3.3)

Four more points that explain the list:

- No shared code maps the options to the plugin. Each SDK copies them by hand, which is why an option works in one SDK and is forgotten in the next. (1)
- Every SDK deletes maps with its own `filesToDeleteAfterUpload` glob. A glob does not know which maps the build made, so it misses some and deletes others that are not Sentry's. (2.1)
- The shared option `sourcemaps.deleteSourcemapsAfterUpload` is new. It is not documented and not finished, and most SDKs do not use it yet. This document does not count that as an issue. Next.js and Gatsby have had their own released option of that name for longer; those are covered. (2.1)
- The JSDoc of the shared options describes the plain plugin's behaviour. In 16 places the code of an SDK or bundler does something else. (5)

---

## Basis

- Code state: `origin/develop` at `9279303f77`.
- Seven PRs are open that change parts of this: [#26332] Remix, [#26333] Gatsby, [#26334] Astro, [#26335] SolidStart, [#26336] TanStack Start, [#26337] Next.js, [#26338] Nuxt. This document does not describe their state. Where one of them fixes an issue, the cell or the item links to it. Section 6 lists what each PR changes.
- Every cell comes from the code, not from JSDoc or comments. The files in `docs/research/build-options-evidence/` hold a `file:line` reference for each cell. Section 8 lists what could not be confirmed, mostly because it depends on framework code outside this repo.

## Terms

- **Sentry plugin**: the bundler plugin from `@sentry/bundler-plugins` (`sentryVitePlugin`, `sentryWebpackPlugin`, `sentryRollupPlugin`).
- **Plugin manager**: `createSentryBuildPluginManager`, which an SDK calls itself after a build.
- **Staged route**: before the bundler writes, the plugin copies each chunk and its map from memory, removes the map from the output, and uploads the copy.
- **Disk route**: after the bundler writes, the plugin reads the files from disk and uploads copies.
- **Direct mode**: the SDK hands whole folders to the CLI through the plugin manager. The plugin reads no file.
- **Unset**: the user gave no source map setting in the bundler or framework config.
- **Sentry-enabled maps**: maps that exist only because the SDK or the plugin turned them on.
- **User-enabled maps**: maps the user turned on in the bundler or framework config.

## The 13 columns

Some SDKs have two code paths that behave differently, so they get two columns. The tables in section 3 also have rows in italics for the plain bundler plugins, used with no SDK. Section 4 has their full detail.

| Column | What it covers |
|---|---|
| Next.js webpack | `sentryWebpackPlugin` in the client, server and edge compilers. `useRunAfterProductionCompileHook` is off. |
| Next.js hook | Upload after the build in Next's `runAfterProductionCompile`: every Turbopack build, and webpack with `useRunAfterProductionCompileHook: true` ("webpack+hook"). |
| Nuxt client | The Sentry Vite plugin on the client build, plus the SDK's own deletion after the build. |
| Nuxt server | The Sentry Rollup plugin inside Nitro, plus the SDK's own deletion after the build. |
| Nitro | `@sentry/nitro`. The server part of SolidStart 2 uses the same code, so this column also describes it. |
| Astro | `@sentry/astro`. |
| SvelteKit | `@sentry/sveltekit`. |
| Remix | `sentryRemixVitePlugin`. The two CLI scripts are in section 1 only. |
| React Router | The Vite plugin and the separate `sentryOnBuildEnd` step, which the user must register. |
| SolidStart 1 | `withSentry` with `sentrySolidStartVite`. |
| SolidStart 2 client | The Vite plugin of `sentrySolidStart()`. |
| TanStack Start | `sentryTanstackStart`. |
| Gatsby | `gatsby-node.js`. Its options are flat and untyped. |

---

## 1. Mechanics

| Column | Engine | Runs for | When the upload runs | How options reach the plugin | Development mode check |
|---|---|---|---|---|---|
| Next.js webpack | `sentryWebpackPlugin` | Client, server and edge compilers, one instance each | `afterEmit` of each compiler | Explicit key list | `buildContext.dev` from Next.js |
| Next.js hook | Plugin manager and CLI. webpack+hook also keeps the three webpack plugins, with `sourcemaps.disable: true` forced | The whole `.next` folder, once | After the build, in `runAfterProductionCompile` | Explicit key list (same function) | None on the hook path. The plugin manager checks `NODE_ENV` |
| Nuxt client | `sentryVitePlugin`, plus SDK deletion | The Vite client build only. No client upload with the webpack or rspack builder | `writeBundle`. Deletion at Nitro `buildStart` and Nuxt `close` | Explicit key list; `release` is spread | `nuxt.options.dev`, `nuxt.options._prepare` |
| Nuxt server | `sentryRollupPlugin` in Nitro's Rollup config, plus SDK deletion | Nitro's server build | `writeBundle`. Deletion at Nitro `buildStart` and Nuxt `close` | Same as Nuxt client | `nitroConfig.dev`, `nuxt.options.dev`, `_prepare` |
| Nitro | Plugin manager and CLI | Nitro's server folder | After the build, in Nitro's `compiled` hook | Explicit key list | `nitro.options.dev`, for the upload hook only |
| Astro | `sentryVitePlugin` | Every Vite build Astro runs (client, server, prerender) | `writeBundle` of each build | Explicit key list; `sourcemaps` is spread | `command !== 'dev'` from Astro |
| SvelteKit | `sentryVitePlugin` with its `writeBundle` taken off and called later | Injection in every build. One upload for the adapter output folder | After the adapter: `closeBundle` (Kit 2) or `buildApp` (Kit 3) | Object spread of all user options | `NODE_ENV` |
| Remix | `sentryVitePlugin` | Each Vite build (client and SSR) | `writeBundle` of each build | Explicit key list | `NODE_ENV` |
| React Router | `sentryVitePlugin` with source maps forced off, plus the `sentry` CLI package in `sentryOnBuildEnd` | The whole build directory, once | After the build, in React Router's `buildEnd` hook | Plugin: explicit key list. Build end step: fixed keys | Plugin: `NODE_ENV`, Vite `command` and `mode`. Build end step: none |
| SolidStart 1 | `sentryVitePlugin` | Each Vite build that uses `solidStartConfig.vite`. Not Nitro's own build | `writeBundle` | Explicit key list; `sourcemaps` is spread | `NODE_ENV` |
| SolidStart 2 client | `sentryVitePlugin` | The Vite build. The SDK sets no environment filter | `writeBundle` | Rest spread of all user options | `NODE_ENV` |
| TanStack Start | `sentryVitePlugin` | The client and `nitro` environments. Not a Nitro `ssr` service | `writeBundle` of each environment | Explicit key list | `NODE_ENV` |
| Gatsby | `sentryWebpackPlugin` | Every webpack stage of a production build | `afterEmit` of each stage | A fixed literal. Two user keys are read | `NODE_ENV === 'production'` |

**Plugin order in Remix, SolidStart and TanStack Start.** The Sentry plugin decides about source maps in its own `config` hook, and on develop that hook runs before the SDK's plugin that sets `build.sourcemap: 'hidden'`. So the plugin sees an unset setting. When an upload can run, the plugin applies its own rule: it turns hidden maps on, stages the chunks and removes every chunk map before write. When no upload can run, the plugin does nothing, the SDK turns hidden maps on afterwards, and only the SDK's glob deletes them. In Astro, Nuxt, Next.js and Gatsby the SDK sets the source map setting first, so the plugin sees `hidden` and leaves the maps to the SDK's glob.

Two Remix CLI scripts upload outside the bundler. `sentry-upload-sourcemaps` injects debug IDs, uploads `--buildPath`, and deletes every `.map` file under it (`--deleteAfterUpload`, default `true`), also after a failed upload. `sentry-remix-v3-upload-sourcemaps` emits the browser modules into a temporary folder, uploads it, and deletes nothing from the app's build output.

---

## 2. Matrix A: what each SDK does with each option

Cell values:

- **pass**: the user's value reaches the plugin or the SDK's upload code unchanged. The SDK sets no default.
- **default**: the SDK sets a value when the user gives none. A user value replaces it unless the cell says "added".
- **forced**: the SDK overwrites the user's value.
- **mapped**: the SDK reads the option and turns it into another mechanism.
- **dropped**: the option is in the SDK's type, and no code reads it.
- **never applied**: the value is passed on, and the code that would use it does not run.
- **no type**: the SDK's type does not have the option. For Gatsby: the option is not read.

### 2.1 `sourcemaps.*`

| Column | `disable: true` | `disable: 'disable-upload'` | `assets` | `ignore` | `filesToDeleteAfterUpload` | `deleteSourcemapsAfterUpload` (see the note below) | `rewriteSources` | `resolveSourceMap` |
|---|---|---|---|---|---|---|---|---|
| Next.js webpack | pass. The SDK also turns no maps on | pass. The SDK also turns no maps on | default: `static/chunks/pages/**` and `app/**` (client), `server/**` (server, edge) | default, user value **added**: framework, polyfill, webpack and manifest files | default for the client: `static/**/*.{js,mjs,cjs,css}.map` when deletion is on. No default for server and edge | Next.js's own option. default `true` for the client, also for user-enabled maps. mapped to the glob on the left | default: strips `webpack://` | pass |
| Next.js hook | pass. webpack+hook: forced `true` on the webpack plugins | pass. Debug IDs are still injected | default: a list of **folders**, not globs | default, user value **added**. Passed to the CLI | default: `static/**/*.{js,mjs,cjs,css}.map` when deletion is on | Next.js's own option. mapped to that glob. Turbopack also strips `sourceMappingURL` comments. Default `true` only when the SDK turned the maps on (Turbopack) | never applied | never applied |
| Nuxt client | mapped: no Sentry plugin | pass | pass | pass | mapped: the SDK runs the glob itself. default: `<publicDir>/**/*.map` when the SDK turned the client maps on | Not used yet. Wired up by [#26338] | default: `../../` becomes `./` | pass |
| Nuxt server | mapped: no Sentry plugin | pass | pass | pass | mapped: the SDK runs the glob itself. default: `<serverDir>/**/*.map` when the SDK turned the server maps on | Not used yet | default: `../../` becomes `./` | pass |
| Nitro | mapped: no upload hook | pass. The SDK also skips the deletion | pass, as **folders** | pass, to the CLI | default: `<serverDir>/**/*.map` | Not used yet | never applied (a default is set) | dropped |
| Astro | mapped: no Sentry plugin | pass | default: `<outDir>/**/*` | pass | default: four globs under `./dist` when the SDK turned the maps on | pass, with no SDK default. Wired up by [#26334] | pass | pass |
| SvelteKit | pass. The SDK does not read it | pass. The SDK does not read it | pass | pass | default: `./.*/**/*.map` and `./<adapterDir>/**/*.map` | Not used yet | pass | pass |
| Remix | pass. The SDK also turns no maps on | pass. The SDK sets no default glob | pass | pass | default: `<outDir>/**/*.map` when the SDK turned the maps on and `disable` is unset | Not used yet. Wired up by [#26332] | pass | pass. Not called for staged chunks |
| React Router | Plugin: forced `true`. Build end step: no injection, upload or deletion | Build end step: injection only | dropped | dropped | default: `<buildDirectory>/**/*.map`, whoever turned the maps on | Not used yet | dropped | no type |
| SolidStart 1 | mapped: no Sentry plugin | pass | pass | pass | default: `.*/**/*.map` | pass, with no SDK default. Wired up by [#26335] | pass | pass. Not called for staged chunks |
| SolidStart 2 client | mapped: no Sentry plugin | pass | pass | pass | default: `./**/*.map`, which skips dot folders such as `.output` | pass, with no SDK default. Wired up by [#26335] | pass | pass. Not called for staged chunks |
| TanStack Start | pass. The SDK also turns no maps on | pass. The SDK also turns no maps on | pass | pass | default: `<outDir>/**/*.map` for each environment whose maps the SDK turned on | Not used yet. Wired up by [#26336] | default: removes TanStack split queries | pass. Not called for staged chunks |
| Gatsby | no type. `enableClientWebpackPlugin: false` removes the plugin | no type | no type. Fixed: `./public/**` | no type. Fixed: `polyfill-*`, `framework-*`, `webpack-runtime-*` | no type. The SDK sets `./public/**/*.map` when deletion is on | Gatsby's own option, flat at the top level. default: on when the SDK turned the maps on. mapped to the glob on the left, in every stage | no type | no type |

Note on `deleteSourcemapsAfterUpload`: the option in the shared SDK type and in the bundler plugin is new. It is not documented and not finished, so this document does not treat an SDK that does not use it yet as an issue. Next.js and Gatsby are different: each has had its own released option of that name for longer, and both turn it into a glob.

On develop, every SDK that deletes maps does it with a `filesToDeleteAfterUpload` glob. The plugin runs such a glob after every build, also when no upload ran.

### 2.2 Other options

| Column | `release.inject` | Other `release.*` | `org`, `project`, `authToken`, `sentryUrl` | `bundleSizeOptimizations` | `applicationKey`, `moduleMetadata` | Do keys outside the type reach the plugin? | SDK-only options |
|---|---|---|---|---|---|---|---|
| Next.js webpack | no type. forced `false`; the SDK injects the release itself | `name`: default from the SDK. Others pass. Each of the three plugins creates the release | pass | pass, and the SDK adds its own define plugin | `applicationKey`: client only. `moduleMetadata`: pass | No | `widenClientFileUpload`, `useRunAfterProductionCompileHook`, `webpack.disableSentryConfig` |
| Next.js hook | no type. forced `false` | As webpack. webpack+hook creates the release in each webpack plugin and again in the hook | pass | Turbopack: mapped to `compiler.define`. `excludeChannelInjection` has no mapping | Turbopack: `applicationKey` only on Next.js 16 or later. `moduleMetadata` never applied | No | Same as webpack |
| Nuxt client | pass | pass | default: `SENTRY_*` env vars | pass | pass | Inside `release` only | `enabled` |
| Nuxt server | pass | pass. Client and server plugin both create the release | default: env vars | pass | pass | Inside `release` only | `enabled` |
| Nitro | never applied | pass | default: env vars | never applied | dropped | Inside `release` only | None |
| Astro | pass | pass | default: env vars | pass | pass | Inside `sourcemaps` and `release` | `enabled` |
| SvelteKit | pass | `name`: default from the SDK. Others pass | pass | pass. This option alone makes the SDK create the plugin | pass | Yes, all | `autoUploadSourceMaps`, `adapter` |
| Remix | pass | pass | default: env vars | pass | pass | Inside `release` only | None |
| React Router | pass (plugin) | Plugin: pass. Build end step: reads `name` only; `create` and `dist` dropped | Plugin: default env vars. Build end step: pass | pass | pass | No | `sentryOnBuildEnd` is opt-in |
| SolidStart 1 | pass | pass | default: env vars | pass | pass | Inside `sourcemaps` | None |
| SolidStart 2 client | pass | pass | default: env vars | pass | pass | Yes, all | None |
| TanStack Start | pass | pass | default: env vars | pass | pass | Inside `release` only | None |
| Gatsby | no type. Plugin default `true` | no type. Plugin defaults | no type. Env vars only | no type | no type | No | `enableClientWebpackPlugin`, `deleteSourcemapsAfterUpload` |

Notes:

- SvelteKit `autoUploadSourceMaps: false` stops the option spread, so only `bundleSizeOptimizations` reaches the plugin. If `bundleSizeOptimizations` is set, the plugin still exists, the SDK still turns hidden maps on, and the deferred upload step still runs. With the `SENTRY_*` environment variables set, the upload then runs.
- In the plugin manager's direct mode (Next.js hook, Nitro), `release.inject`, `bundleSizeOptimizations`, `applicationKey` and `moduleMetadata` are not applied. Next.js on Turbopack applies some of them through its own loader rules and `compiler.define`.

---

## 3. Matrix B: what happens in each situation

Unless a column head says otherwise: production build, auth token, org and project set, source map setting unset, no other Sentry source map option.

### 3.1 How are debug IDs injected and files uploaded?

| Column | Debug IDs injected by | Upload route, default build | Upload route, user-enabled maps |
|---|---|---|---|
| Next.js webpack | Plugin | Disk, all three compilers | Disk |
| Next.js hook | Turbopack: `turbopack.debugIds`, or the CLI on `.next`. webpack+hook: the CLI on `.next` | Folders to the CLI | Folders to the CLI |
| Nuxt client | Plugin | Disk | Disk |
| Nuxt server | Plugin | Disk | Disk |
| Nitro | CLI, on the server folder after the build | Folder to the CLI | Folder to the CLI |
| Astro | Plugin | Disk | Disk |
| SvelteKit | Plugin | Disk, after the adapter. The SDK first rewrites the maps on disk | Disk, same |
| Remix | Plugin | Staged (see "Plugin order" in section 1) | Disk |
| React Router | CLI, on the build directory after the build | Folder to the CLI | Folder to the CLI |
| SolidStart 1 | Plugin | Staged | Disk |
| SolidStart 2 client | Plugin | Staged | Disk |
| TanStack Start | Plugin. Not in a Nitro `ssr` service | Client: staged. `nitro`: disk | Disk |
| Gatsby | Plugin | Disk, in every stage | Disk |
| *Plain webpack plugin* | Plugin | Staged | Disk |
| *Plain Rollup, Rolldown or Vite plugin* | Plugin | Staged | Disk |
| *Plain esbuild plugin* | Plugin | Disk | Disk |
| *Plain Bun plugin* | Plugin, only when Bun's `sourcemap` is on and `outdir` is set | No upload: no maps exist | Disk |

Nuxt: Nuxt's own default is `sourcemap: { server: true, client: false }`. The SDK treats both as user choices. So an app that never mentions `sourcemap` gets no client maps and no client upload, and its server maps are uploaded and kept. The "unset" cells for Nuxt below only apply when the user writes `client: undefined` or `server: undefined`.

### 3.2 Which source maps does Sentry turn on?

| Column | Setting unset | User turned maps off | No auth token | `disable: true` | `disable: 'disable-upload'` |
|---|---|---|---|---|---|
| Next.js webpack | Client: `hidden-source-map`. Server, edge: `source-map` | **Same as unset.** A falsy `devtool` is replaced | Same as unset | None | None |
| Next.js hook | Turbopack: `productionBrowserSourceMaps = true`, client only. webpack+hook: as webpack | Turbopack: none. webpack+hook: **replaced**, as webpack | Same as unset | None | None |
| Nuxt client | `hidden` | None | `hidden` | None | `hidden` |
| Nuxt server | `hidden` | None | `hidden` | None | `hidden` |
| Nitro | `hidden`, also in development mode | None | `hidden` | None | `hidden` |
| Astro | `hidden`, for every build | None | `hidden` | None | `hidden` |
| SvelteKit | `hidden` | None | `hidden` | **`hidden`** | `hidden` |
| Remix | `hidden` | None | `hidden` | None | `hidden` |
| React Router | `hidden` | None | `hidden` | **`hidden`** | `hidden` |
| SolidStart 1 | `hidden` | None | `hidden` | None | `hidden` |
| SolidStart 2 client | `hidden` | None | `hidden` | None | `hidden` |
| TanStack Start | `hidden`, top level and Nitro | None | `hidden` | None | **None** |
| Gatsby | `hidden-source-map`, in every stage | **Same as unset.** Every `devtool` except `source-map` and `hidden-source-map` is replaced | Same as unset | Not exposed | Not exposed |
| *Plain webpack plugin* | `hidden-source-map` | None | **None** | None | None |
| *Plain Rollup, Rolldown or Vite plugin* | `hidden` | None | **None** | None | None |
| *Plain esbuild plugin* | `external`, which is esbuild's hidden setting | None | **None** | None | None |
| *Plain Bun plugin* | **None** | None | None | None | None |

No SDK checks the auth token before it turns maps on. The plain bundler plugins do: without a token they turn no maps on, so there is nothing to remove. The plain Bun plugin never turns maps on; with Bun's `sourcemap` unset it adds no debug IDs and uploads nothing, with no warning.

TanStack Start: with top-level `build.sourcemap` set to `true` or `'hidden'`, the SDK still turns hidden maps on for the Nitro server build.

### 3.3 Which source maps are removed from the build output?

Cell values:

- **all**: every chunk map of the build, removed by the plugin before the bundler writes. No such map file reaches the output.
- **glob**: files that match a glob, deleted from disk after the upload step. The glob does not know which maps the build made.
- **none**: no map is removed.

| Column | Default build | User-enabled maps | No auth token | `disable: true` | `disable: 'disable-upload'` | User sets `filesToDeleteAfterUpload` |
|---|---|---|---|---|---|---|
| Next.js webpack | Client: glob, `static/**` maps. Server, edge: none | Client: **glob.** A visible map's `sourceMappingURL` comment stays; fixed by [#26337]. Server, edge: none | Client: glob, no upload | none | none | The user's glob replaces the default |
| Next.js hook | glob: `static/**` maps. Turbopack also strips the comments | Turbopack: none. webpack+hook: glob | glob, no upload | none | none | The user's glob replaces the default. Turbopack still strips the comments |
| Nuxt client | glob: every `.map` file in the public folder; fixed by [#26338]. No deletion with `server.builder: 'vite'`; fixed by [#26338] | none | glob, no upload | none | **glob, no upload** | The user's glob replaces the default |
| Nuxt server | glob: `<serverDir>/**/*.map` | none | glob, no upload | none | **glob, no upload** | The user's glob replaces the default |
| Nitro | glob: `<serverDir>/**/*.map` | none | glob, no upload | none | none | The user's glob replaces the default |
| Astro | glob: four globs under `./dist`. With a custom `outDir` the maps stay; fixed by [#26334] | none | glob, no upload | none | **glob, no upload** | The user's glob replaces the default |
| SvelteKit | glob: dot folders and the adapter folder | none | glob, no upload | **glob.** The maps the SDK turned on are deleted | **glob, no upload** | The user's glob replaces the default |
| Remix | all (the plugin's own rule), then glob `<outDir>/**/*.map` | none | glob, no upload | none | none | The user's glob replaces the default glob. With an upload the plugin still removes all chunk maps |
| React Router | glob: `<buildDirectory>/**/*.map` | **glob.** All maps, also user-enabled | glob, also after a failed upload | none. The hidden maps stay | none | The user's glob replaces the default |
| SolidStart 1 | all (the plugin's own rule), then glob `.*/**/*.map`: every map in every top-level dot folder; fixed by [#26335] | none | glob, no upload | none | **glob, no upload** | The user's glob replaces the default glob. With an upload the plugin still removes all chunk maps |
| SolidStart 2 client | all (the plugin's own rule). The default glob `./**/*.map` skips dot folders | none | **none.** The glob skips dot folders, so the client maps stay in `.output/public`; fixed by [#26335] | none | none in dot folders. The glob skips them | The user's glob replaces the default glob. With an upload the plugin still removes all chunk maps |
| TanStack Start | Client: all (the plugin's own rule). `nitro`: glob. On Vite 7 the glob misses `.output/server`; fixed by [#26336] | Client: none. `nitro`: glob | glob, no upload | none | none. No maps exist | Client: with an upload the plugin still removes all chunk maps. `nitro`: only what the user's glob matches |
| Gatsby | glob: `./public/**/*.map`, in every stage | none | glob, no upload | Not exposed | Not exposed | Not exposed |
| *Plain webpack plugin* | all, CSS maps included | none | none. No maps are made | none | none | all, plus the user's glob |
| *Plain Rollup, Rolldown or Vite plugin* | all chunk maps. CSS maps stay | none | none. No maps are made | none | none | all chunk maps, plus the user's glob |
| *Plain esbuild plugin* | all, deleted from disk after a successful upload | none | none. No maps are made | none | none | all, plus the user's glob |
| *Plain Bun plugin* | none. No maps exist | none | none | none | none | Only the user's glob |

Next.js and Gatsby each have their own released `deleteSourcemapsAfterUpload` option, which switches the glob in the first column on and off. `false` keeps the maps in both. In Next.js it is on by default for the client, also for user-enabled maps. In Gatsby it is on by default only when the SDK turned the maps on; set to `true` with a visible `devtool`, the glob deletes the maps and the `sourceMappingURL` comments stay, which [#26333] fixes.

Reading the bold cells:

- **`disable: 'disable-upload'`**: its JSDoc says it is for a manual upload later. In Nuxt client, Nuxt server, Astro, SvelteKit and SolidStart 1 the SDK's glob deletes the Sentry-enabled maps, so nothing is left to upload unless the user turned the maps on themselves.
- **User-enabled maps**: only Next.js webpack and React Router remove them by default.
- **`disable: true`**: SvelteKit still turns hidden maps on and deletes them. React Router still turns them on and leaves them in the output.
- **No auth token**: every SDK deletes the maps it turned on, with no upload. SolidStart 2 is the exception, and there the maps stay in the public folder.

### 3.4 What `sourcemaps.disable: true` switches off besides source maps

| Column | Is the Sentry plugin still added? | Also switched off |
|---|---|---|
| Next.js webpack | Yes | Nothing |
| Next.js hook | Yes. The hook still runs and creates the release | Nothing |
| Nuxt client | **No** | Release injection, release creation, `bundleSizeOptimizations`, `applicationKey`, `moduleMetadata` |
| Nuxt server | **No** | The same, for the server |
| Nitro | The upload hook is not registered | Release creation. The same happens with Nitro `sourcemap: false` or `'inline'` |
| Astro | **No** | Release injection, release creation, `bundleSizeOptimizations`, `applicationKey`, `moduleMetadata` |
| SvelteKit | Yes | Nothing. The SDK also still turns hidden maps on and deletes them |
| Remix | Yes | Nothing |
| React Router | Yes | Nothing. The SDK also still turns hidden maps on |
| SolidStart 1 | **No** | Release injection, release creation, `bundleSizeOptimizations`, `applicationKey`, `moduleMetadata` |
| SolidStart 2 client | **No** | The same |
| TanStack Start | Yes | Nothing |
| Gatsby | Not exposed. `enableClientWebpackPlugin: false` removes the plugin | With that option: everything the plugin does |
| *Plain plugins (all five)* | Yes | Nothing. Release creation, release injection, `release.uploadLegacySourcemaps` and `filesToDeleteAfterUpload` still run |

In the bundler plugin itself, `sourcemaps.disable: true` stops debug ID injection, the upload and the source map decision. It does not stop release creation, release injection, `release.uploadLegacySourcemaps` or `filesToDeleteAfterUpload`.

---

## 4. Matrix C: the bundler plugins without an SDK

This section describes `@sentry/bundler-plugins` when a user adds a plugin directly. That covers `@sentry/vite-plugin`, `@sentry/webpack-plugin`, `@sentry/rollup-plugin` and `@sentry/esbuild-plugin`, which re-export it, and `@sentry/node/vite`, `/webpack`, `/rollup`, `/esbuild` and `@sentry/bun/plugin`, which pass the user's options straight through. `@sentry/nestjs` and `@sentry/aws-serverless` re-export the `@sentry/node` entries. No open PR changes this section. The sixth column, direct mode, is how Next.js hook and Nitro call the plugin manager after a build.

More terms for this section:

- **Kind**: the bundler's source map setting reduced to `unset`, `off`, `visible`, `hidden` or `inline`.
- **Upload can run**: `sourcemaps.disable` is not set, `sourcemaps.assets` is not `[]`, `NODE_ENV` is not `development`, and auth token, org and project are set.
- **removeAll**: the plugin removes every map of the build, not only the maps of uploaded chunks. It applies when the plugin turned the maps on itself, or when an SDK passes the internal `sdkEnabledSourceMaps` flag. No SDK on develop passes that flag; the seven open PRs do.

The tables below include `sourcemaps.deleteSourcemapsAfterUpload`, because that option and the plugin's default source map handling are one decision in the code. The option is new, not documented and not finished. The rows state what the code does today, not a contract.

There is no Bun fixture and no fixture for watch mode, `generate()` or `write: false` in the integration tests. Cells for those come from the plugin source only.

### 4.1 Routes

| Case | webpack | Rollup and Rolldown | Vite | esbuild | Bun | Direct mode |
|---|---|---|---|---|---|---|
| Entry point and option type | `sentryWebpackPlugin`, takes `InternalOptions` | `sentryRollupPlugin`, takes public `Options`, returns `[main, post]`. Rolldown uses the same function; there is no Rolldown entry | `sentryVitePlugin`, takes `InternalOptions`, returns `[main (enforce pre), post (enforce post)]`. Same internals as Rollup | `sentryEsbuildPlugin`, takes `InternalOptions` | `sentryBunPlugin`, takes public `Options` | `createSentryBuildPluginManager`, takes `InternalOptions` |
| Hooks | `apply`; `compilation` + `processAssets` at stage ADDITIONS (inject release, metadata, debug ID snippet); `thisCompilation` + `processAssets` at REPORT+1 (stage or drop maps); `thisCompilation` + `processAssets` at DEV_TOOLING+1 (stamp, only with `disable-upload`); `emit`, `done`, `failed` (settle unused stagings); `afterEmit` (release, upload, `deleteArtifacts`). Also adds a `DefinePlugin` and a loader rule | main: `buildStart`, `transform` (only with annotation or bundle size flags), `outputOptions`, `renderChunk`, `generateBundle` (order pre), `writeBundle`. post: `generateBundle` (order post). Rolldown: same hooks | main: `buildStart`, `transform`, `configResolved`, `renderChunk`, `generateBundle` (pre), `writeBundle`. post: `config`, `generateBundle` (post). No `outputOptions` hook | `setup` (edits `initialOptions.inject`, `define`, `logOverride`, `sourcemap`, `metafile`), `onResolve`, `onLoad`, `onStart`, `onEnd` | `setup` (edits `config.banner`, `config.define`), `onEnd` | None. The caller calls the functions |
| When it decides, from which setting | Once per compiler in `apply`, from `compiler.options.devtool`. No decision when `mode === 'development'`, or when `devtool: false` and a `SourceMapDevToolPlugin` is in `plugins` | Per output in the `outputOptions` hook, from `output.sourcemap` | In the `config` hook of the post plugin, only for `command === 'build'`, from `build.sourcemap` and from each `environments.<name>.build.sourcemap` that is set. `configResolved` stores the decision per output. An output with its own `sourcemap` in `rollupOptions.output` or `rolldownOptions.output` gets a separate rule (see 8b) | Once in `setup`, from `initialOptions.sourcemap`. No decision when `write === false` | Never. It reads `config.sourcemap` and `config.outdir` only to decide if it adds debug IDs and uploads | Never, unless the caller calls `sourceMaps.decide(kind)` |
| Setting to kind | `undefined` unset; `false` off; string without `source-map` off; contains `inline` or `eval` inline; contains `hidden` hidden; else visible | `undefined` unset; `false` off; `true` visible; `'hidden'`; `'inline'` | Same as Rollup | `undefined` unset; `false` off; `'external'` hidden; `'inline'` and `'both'` inline; `true` and `'linked'` visible | Not mapped | The caller gives the kind |
| Staged route runs when | The decision says delete (table 8a) and the upload can run. Each JS asset that has a map asset is copied. The map asset and its `.map.*` variants are removed when the copy worked, or always with removeAll. With removeAll the maps of non-JS assets (CSS) are removed too | The decision says delete, the upload can run, and `isWrite !== false`. Each JS chunk with a string map asset is copied. The map is removed from the bundle when the copy worked, or always with removeAll. With removeAll and a kind other than `unset`, other `.map` assets are removed too | Same code as Rollup | Never | Never | Only when the caller creates a staging with `createUploadStaging()` and passes it. Its folder is added to the paths |
| Disk route runs when | In `afterEmit` of every compilation, unless `sourcemaps.disable` is set. File list: every name in `compilation.assets` | In `writeBundle` of every written output, unless `sourcemaps.disable` is set. File list: glob of all `.js`, `.mjs`, `.cjs` and their `.map` files under `output.dir` (the whole folder), else `[output.file]`, else the bundle keys | Same code as Rollup | In `onEnd` of every build, unless `sourcemaps.disable` is set. Also with `write: false`. File list: the metafile outputs | In `onEnd`, only when `config.outdir` is set, `config.sourcemap` is on and not `'none'`, and `sourcemaps.disable` is not set. File list: outputs of kind `entry-point` or `chunk` | Never. The plugin reads no file; the CLI gets the folders |
| Maps removed without an upload when | The decision says delete and the upload cannot run. Removes the maps of JS assets that pass the upload filter, or all maps with removeAll | Same condition, in post `generateBundle`. Also with `isWrite === false`: chunk maps are removed when the kind is `unset` and the plugin turned hidden maps on | Same code as Rollup | The decision says delete and the upload cannot run. After the write, deletes from disk the maps of JS outputs that pass the upload filter, or all `.map` outputs with removeAll | Never | Never. `sourceMaps.deleteFromOutput(paths)` exists for the caller |
| Disk glob next to the staged route | Yes. It skips the staged chunks and prepares every other matched JS file from disk | Yes. Same | Yes. Same | No staged route | No staged route | No glob. The staging folder is one more CLI path |
| Change to hidden maps | Sets `compiler.options.devtool` to `'hidden-' + devtool` (kind visible) or `'hidden-source-map'` (kind unset) | Returns the output options with `sourcemap: 'hidden'` from `outputOptions` | Returns `{ build: { sourcemap: 'hidden' } }` and `environments.<name>.build.sourcemap: 'hidden'` from `config`. Never changes an output's own `sourcemap` | Sets `initialOptions.sourcemap = 'external'` | Never changes `config.sourcemap` | Nothing. `decide()` only returns `enableHidden` |

### 4.2 Options

Values: **takes effect**, **takes effect on <route> only**, **no effect**, **different meaning**.

| # | Option | webpack | Rollup and Rolldown | Vite | esbuild | Bun | Direct mode |
|---|---|---|---|---|---|---|---|
| 1 | `sourcemaps.disable: true` | **takes effect.** No debug ID snippet, no stamping, no upload, no hidden maps turned on. Release injection and creation, metadata, bundle size flags, annotation and `filesToDeleteAfterUpload` still run | **takes effect.** Same | **takes effect.** Same | **takes effect.** Same. The entry proxy for debug IDs is not added | **takes effect.** No placeholder in the banner, no upload | **takes effect on the upload only.** `uploadSourcemaps` returns `uploaded: false`. `injectDebugIds` and `deleteArtifacts` do not check it |
| 2 | `sourcemaps.disable: 'disable-upload'` | **takes effect.** Snippet is injected. No upload. In `processAssets` (DEV_TOOLING+1) each JS asset gets a `//# debugId=` comment and its map asset gets `debug_id` and `debugId`. A bundle with no map is not stamped | **takes effect.** Snippet in `renderChunk`. In `generateBundle` (pre) the comment goes into the chunk code and the two fields into the map asset. Rolldown: the placeholder IDs are replaced first, in the same hook | **takes effect.** As Rollup. The post `generateBundle` writes the two fields into the maps a second time, without a change to the chunk code | **takes effect.** Snippet through the entry proxy. After the write, each JS output and its map are rewritten on disk. `resolveSourceMap` is used to find the map. Skipped with `write: false` | **takes effect, other stamping.** The placeholder in the banner is replaced on disk with Bun's own debug ID. The plugin writes nothing into the map. No upload | **takes effect on the upload only**, same as `true`. `injectDebugIds` runs CLI `sourcemap inject` on each folder |
| 3 | `sourcemaps.assets` | **takes effect.** Globs. Disk route: replaces the file list. Staged route: filters the build's chunks by output path. `[]`: no upload, no hidden maps turned on | **takes effect.** Same | **takes effect.** Same | **takes effect.** Globs, replace the file list. `[]`: no upload, no hidden maps | **takes effect.** Globs, replace the file list. `[]`: no upload | **different meaning.** Each entry goes to the CLI as a folder, not globbed by the plugin. It replaces the paths the caller gave. `[]`: no upload |
| 4 | `sourcemaps.ignore` | **takes effect.** Disk route: glob `ignore`. Staged route: filter. Maps with removeAll are removed for ignored chunks too; maps the user turned on stay for ignored chunks | **takes effect.** Same | **takes effect.** Same | **takes effect.** Glob `ignore`. With removeAll every `.map` output is deleted; else only the uploaded maps | **takes effect.** Glob `ignore` | **different meaning.** Passed to the CLI as its `ignore` flag for the upload and for `sourcemap inject`. For inject the default is `node_modules` |
| 5 | `sourcemaps.rewriteSources` | **takes effect** on both routes, on the uploaded copy only. Not used for `disable-upload` stamping | **takes effect.** Same | **takes effect.** Same | **takes effect** (disk route) | **takes effect** (disk route) | **no effect** |
| 6 | `sourcemaps.resolveSourceMap` | **takes effect on the disk route only.** The staged route takes the map from the compilation | **takes effect on the disk route only.** The staged route takes the map from the bundle | **takes effect on the disk route only** | **takes effect** on the disk route and for `disable-upload` stamping | **takes effect** (disk route) | **no effect** |
| 7 | `sourcemaps.filesToDeleteAfterUpload` | **takes effect.** Runs in a `finally` after every `afterEmit`: also with no upload, with `sourcemaps.disable`, in development mode and after an error | **takes effect.** Runs in a `finally` in every `writeBundle`. Not with `generate()` | **takes effect.** Same as Rollup | **takes effect.** Runs in a `finally` in every `onEnd`, also with `write: false` | **takes effect.** Runs in a `finally` in every `onEnd`. Not when Bun gives no `config` | **takes effect** when the caller calls `deleteArtifacts()`. It does not look at the upload result |
| 8 | `sourcemaps.deleteSourcemapsAfterUpload` | See 8a and 8b | See 8a and 8b | See 8a and 8b | See 8a and 8b | **no effect** | **no effect** unless the caller calls `sourceMaps.decide` |
| 9 | Internal `sdkEnabledSourceMaps` and function form of `deleteSourcemapsAfterUpload` | Accepted by the type. The function is called with no environment | The type (`Options`) does not accept them. The code reads them at run time | Accepted. The function gets the environment name for an environment with its own `build.sourcemap`, else `undefined` | Accepted. The function is called with no environment | The type does not accept them. The code never reads them | Accepted by the type. Read only in `sourceMaps.decide(kind, { environment })` |
| 10 | top-level `disable: true` | **takes effect.** `apply` does nothing | **takes effect.** One plugin with a name and no hooks | **takes effect.** One plugin with a name and no hooks | **takes effect.** Empty `setup` | **takes effect.** Empty `setup` | **takes effect.** Every method does nothing; `uploadSourcemaps` returns `uploaded: false`; `filesToDeleteAfterUpload` does not run |
| 11a | `release.inject` | **takes effect.** Release snippet in the JS files of chunks that can be initial | **takes effect.** In `renderChunk`, for initial chunks | **takes effect.** Same as Rollup | **takes effect.** Through a virtual file in `initialOptions.inject` | **takes effect.** Through `config.banner` | **no effect** |
| 11b | `release.create` | **takes effect.** `false` skips only the `release create` call. Set commits, finalize, deploy and the legacy upload still run | **takes effect.** Same | **takes effect.** Same | **takes effect.** Same | **takes effect.** Same | **takes effect** only when the caller calls `createRelease()` |
| 11c | `release.uploadLegacySourcemaps` | **takes effect**, in `createRelease()`. Read from `IncludeEntry`: `paths`, `ext`, `ignore`, `ignoreFile`, `urlPrefix` | Same | Same | Same | Same | Same, when the caller calls `createRelease()` |
| 12a | `reactComponentAnnotation` | Supported (loader rule) | Supported (`transform`) | Supported (`transform`) | Not supported; logs a warning | Not supported; no warning | Not applied |
| 12b | `bundleSizeOptimizations` | Supported (`DefinePlugin`) | Supported (`transform`) | Supported (`transform`) | Supported (`define`) | Supported (`define`) | Not applied; values are exposed as `bundleSizeOptimizationReplacementValues` |
| 12c | `moduleMetadata`, `applicationKey` | Supported | Supported | Supported | Supported | Supported | Not applied; values are exposed as `bundleMetadata` |

#### 8a. `deleteSourcemapsAfterUpload`: the decision

One function makes this decision for webpack, Rollup, Rolldown, Vite (for `build.sourcemap` and per-environment settings) and esbuild. With `NODE_ENV=development` every row is "no change".

| Bundler setting | Option | Upload can run | Upload cannot run (no token, org or project, or `assets: []`) | `sourcemaps.disable` set |
|---|---|---|---|---|
| unset | unset or `true` | Hidden maps turned on. Uploaded. All maps the plugin turned on are removed (removeAll) | No change. No maps are made | No change |
| unset | `false` | Hidden maps turned on. Uploaded. Maps stay | No change | No change |
| off | any | No change. Warning that maps are off. Nothing to upload | No change | No change |
| visible | unset or `false` | No change. Uploaded from disk. Maps stay | No change. Maps stay | No change. Maps stay |
| visible | `true` | Switched to hidden. Uploaded. Maps of the uploaded chunks are removed; all maps with `sdkEnabledSourceMaps` | Switched to hidden. No upload. Maps of the chunks that pass the upload filter are removed; all with `sdkEnabledSourceMaps`. Warning | Without `sdkEnabledSourceMaps`: no change, warning that the maps are not removed. With it: switched to hidden, all maps removed, no upload, warning |
| hidden | unset or `false` | No change. Uploaded from disk. Maps stay | No change. Maps stay | No change. Maps stay |
| hidden | `true` | Uploaded. Maps of the uploaded chunks are removed; all maps with `sdkEnabledSourceMaps` | No upload. Maps of the chunks that pass the upload filter are removed; all with `sdkEnabledSourceMaps`. Warning | Without `sdkEnabledSourceMaps`: no change, warning. With it: all maps removed, no upload, warning |
| inline | any | No change. Warning. The bundle with its inline map is uploaded from disk | No change | No change |

#### 8b. `deleteSourcemapsAfterUpload`: how each column carries the decision out

| Point | webpack | Rollup and Rolldown | Vite | esbuild | Bun | Direct mode |
|---|---|---|---|---|---|---|
| Follows 8a | Yes. Not when `mode === 'development'`, and not when `devtool: false` with a `SourceMapDevToolPlugin`: then no change | Yes, per output | Yes for `build.sourcemap` and per-environment settings. Not for an output with its own `sourcemap` (next row) | Yes. Not when `write === false`: then no change | No. **No effect** in every row | No. **No effect** in every row unless the caller calls `sourceMaps.decide(kind)` |
| Exceptions | None | With `generate()`: only maps the plugin turned on are dropped; a `visible` to `hidden` switch stays but nothing is removed | Output with its own `sourcemap`: never switched to hidden. Removed only with `true` and (hidden, or visible with `sdkEnabledSourceMaps`). This rule does not look at `sourcemaps.disable` or at whether the upload can run. If the resolved `sourcemap` of an output is not `'hidden'` when the decision says delete, the maps stay | None | The plugin never turns maps on and never removes maps | `uploadSourcemaps` does not read the option and returns no map paths |
| When and how maps are removed | Before emit, in `processAssets` at REPORT+1. Never written | Before write, in post `generateBundle`. Never written | Same as Rollup | After the write and after the upload, from disk. Only when the upload reports success. Else an error is logged and the maps stay | Not removed | Not removed |
| What removeAll covers for kind `unset` | Maps of all assets, CSS included | Chunk maps only. `.map` assets of other plugins stay | Chunk maps only | Every `.map` file in the metafile | Not applicable | Not applicable |
| Upload fails after the maps were removed | Maps are not in the output. The temp folder is kept and its path is logged | Same | Same | Not applicable: maps are deleted only after a good upload | Not applicable | Not applicable |

### 4.3 Development mode, watch mode, builds that write no files

| Case | webpack | Rollup and Rolldown | Vite | esbuild | Bun | Direct mode |
|---|---|---|---|---|---|---|
| `NODE_ENV=development` (the only check in the shared code) | No release, no upload, no source map decision. Debug ID snippet, release injection, metadata, bundle size flags, annotation, `disable-upload` stamping and `filesToDeleteAfterUpload` still run | Same | Same | Same | Same. The placeholder is still replaced on disk | `createRelease` and `uploadSourcemaps` return early. `decide` returns no change. `injectDebugIds` and `deleteArtifacts` still run |
| The bundler's own development mode | `mode: 'development'` stops only the source map decision. `afterEmit` still creates the release and runs the disk route, unless `NODE_ENV` is `development` | No check | `command !== 'build'` (dev server): the `config` hook returns early, so no decision and no change to `build.sourcemap`. The `transform` hook has no check. That the dev server does not call `renderChunk`, `generateBundle`, `writeBundle`: not confirmed from the plugin code | No check | No check | No check |
| Watch mode or rebuild | The decision is made once in `apply`. Each compilation has its own staging. `afterEmit` runs release, upload and `deleteArtifacts` for each compilation | `outputOptions` decides again for each build. A staging that no `writeBundle` took is thrown away when the same output is built again. Each write runs release, upload and `deleteArtifacts`. No fixture | `config` clears the stored decisions on each call. Else as Rollup. No fixture | `setup` runs once per context, so one decision. `onStart` clears the list of wrapped entries. Each `onEnd` runs release, upload and `deleteArtifacts` | Each `onEnd` runs release, upload and `deleteArtifacts` | Not applicable |
| Build that writes no files | No branch for it. The disk route reads the real file system. Behaviour with an in-memory output file system: not confirmed | `generate()` (`isWrite === false`): the plugin drops the chunk maps it turned on (kind `unset`) and returns. No staging, no upload, no release, no `filesToDeleteAfterUpload` (`writeBundle` does not run). The `disable-upload` stamp in `generateBundle` (pre) still runs | Same code as Rollup. That Vite `build.write: false` passes `isWrite === false`: not confirmed from the plugin code | `write: false`: no decision, no `disable-upload` stamp. `upload()` is still called with the metafile paths and reads the disk. Release and `filesToDeleteAfterUpload` still run | No `outdir`: no debug IDs and no upload. Release injection and creation still run. No `config` (runtime plugin): the plugin does nothing | The plugin reads no file. What the CLI does with a missing folder: not confirmed |


---

## 5. Where JSDoc or comments and code disagree

1. **`sourcemaps.disable: true`.** The JSDoc says it disables all functionality related to source maps. In the plugin, `release.uploadLegacySourcemaps` and `filesToDeleteAfterUpload` still run. In Astro, Nuxt and SolidStart it also disables features that are not about source maps (3.4). In SvelteKit and React Router the SDK still turns hidden maps on.
2. **`sourcemaps.disable: 'disable-upload'`.** The JSDoc says it is for a manual upload later and that the maps get their debug ID inside the build. Five columns delete the maps (3.3). With an unset setting the plugin alone turns no maps on, so nothing is stamped. esbuild stamps on disk after the write. The Bun plugin writes nothing into the maps.
3. **Next.js `sourcemaps.deleteSourcemapsAfterUpload`.** The JSDoc says it defaults to `true`. The code default is `false`, and the client webpack function sets `true` later.
4. **`sourcemaps.filesToDeleteAfterUpload`.** The JSDoc says the files are deleted after the upload has completed. The plugin deletes them after every written build: with no upload, with `sourcemaps.disable`, in development mode and after a failed upload.
5. **`sourcemaps.assets`.** The JSDoc says globs. In direct mode each entry goes to the CLI as a folder.
6. **`sourcemaps.rewriteSources`.** The JSDoc says the default makes sources relative to the working directory. The Next.js default strips the `webpack://` prefix. On the Next.js hook path and in Nitro the hook is never called.
7. **`sourcemaps.ignore`.** The JSDoc says `@default []`. The debug ID injection in direct mode uses `node_modules` when the option is unset.
8. **`errorHandler`.** The JSDoc says the plugin throws by default. Upload and release errors are only logged. SvelteKit catches every error from its deferred upload step.
9. **`reactComponentAnnotation`.** The JSDoc names only esbuild as not supported. Bun does not support it either, and logs no warning.
10. **Next.js `useRunAfterProductionCompileHook`.** The JSDoc says Next.js 15 or later. The code needs 15.4.1 or later.
11. **React Router `sentryOnBuildEnd`.** A code comment says it only cleans up source maps that were uploaded. The deletion runs after the `catch`, so it also runs after a failed upload, and the default glob covers user-enabled maps.
12. **Astro.** A code comment says nothing is uploaded when the user set `sourcemap: false`. The plugin is still added and its upload step runs; it finds no maps.
13. **Gatsby.** The log line "Those source maps will be deleted after they were uploaded to Sentry" also prints with `deleteSourcemapsAfterUpload: false`.
14. **SolidStart 2.** The JSDoc says the Vite plugin covers the client assets only. The code sets no environment filter.
15. **Nuxt.** A type comment lists `'inline'` as an enabled setting. In the object form the code replaces `'inline'` with `'hidden'` and treats the side as unset.
16. **esbuild.** A code comment says a map the plugin turned on never stays in the output. When the upload does not report success, the maps stay and an error is logged.

Options that the plugin accepts and never reads: six `IncludeEntry` fields of `release.uploadLegacySourcemaps` (`urlSuffix`, `stripPrefix`, `stripCommonPrefix`, `sourceMapReference`, `rewrite`, `validate`), `release.vcsRemote`, and `release.setCommits.ignoreMissing` and `ignoreEmpty`.

---

## 6. The seven open PRs

For the paths it touches, each PR replaces the SDK's default `filesToDeleteAfterUpload` glob with the plugin option `deleteSourcemapsAfterUpload: true`, so the plugin removes the maps before the bundler writes them. That also puts the new option to use in these SDKs, so a user's `true` or `false` takes effect there. The numbers refer to the TL;DR list.

| PR | Fixes | Other changes in behaviour |
|---|---|---|
| [#26332] Remix | `.map` files copied from `public/` are no longer deleted (8). | With a user glob and no auth token, the Sentry-enabled maps are now removed too; on develop only the user's glob ran. |
| [#26333] Gatsby | A visible `devtool` no longer leaves `sourceMappingURL` comments behind (16). Maps copied from `static/` or left from an earlier build are no longer deleted (8). | Deletion now only applies to the `build-javascript` stage. |
| [#26334] Astro | Maps no longer stay with a custom `outDir` (2). `.map` files copied from `public/` are no longer deleted (8). | The default build moves to the staged route, so `resolveSourceMap` is no longer called for it. |
| [#26335] SolidStart | SolidStart 2 no longer leaves client maps in `.output/public` without an upload (2). SolidStart 1 no longer deletes every map in every dot folder (8). | With a user glob and no auth token, the Sentry-enabled maps are now removed too. SolidStart 2 keeps the maps with `'disable-upload'`. |
| [#26336] TanStack Start | The server maps no longer stay on Vite 7 (2). | With a user glob, the `nitro` server maps that Sentry turned on are now always removed; on develop they stayed unless the user's glob matched them. |
| [#26337] Next.js | Visible client maps no longer leave `sourceMappingURL` comments behind (16). | The webpack client moves to the staged route, so `resolveSourceMap` is no longer called for it, and client maps are never written to disk. Turbopack and the after-compile hook do not change. |
| [#26338] Nuxt | The SDK no longer deletes every map in the public folder (8). Client maps are removed with `server.builder: 'vite'` (2). | The client build moves to the staged route, so `resolveSourceMap` is no longer called for it. The server side does not change. |

No open PR changes SvelteKit, React Router, Nitro, the Nuxt server side, Next.js on Turbopack or with the after-compile hook, or the bundler plugins. The TL;DR items 1, 3 to 7 and 9 to 15 have no open PR.

---

## 7. Evidence

The folder `docs/research/build-options-evidence/` holds one report per group, each with a `file:line` reference per cell. The reports were written against the seven PR branches. For every cell where a PR changes the answer, the report gives the develop answer in a line that starts with "develop:" and cites it with `HEAD~1:`. This document uses those develop answers. For SvelteKit, React Router, Nitro, the Nuxt server side, the Next.js hook path and the bundler plugins, the branch and develop are the same.

| File | Columns |
|---|---|
| `nextjs-gatsby.md` | Next.js webpack, Next.js hook, Gatsby |
| `nuxt-nitro-solidstart.md` | Nuxt client, Nuxt server, Nitro, SolidStart 1, SolidStart 2 |
| `astro-sveltekit.md` | Astro, SvelteKit |
| `remix-reactrouter-tanstack.md` | Remix, React Router, TanStack Start |
| `bundlers.md` | Section 4 |

The reports were written by five separate read-only passes over the code. The cells behind the TL;DR were then checked a second time by hand. These are the places on develop (`9279303f77`):

- Next.js: `packages/nextjs/src/config/webpack.ts:371` (falsy `devtool` replaced), `:386` (delete default for the client), `packages/nextjs/src/config/getBuildPluginOptions.ts:184`, `:290`, `:350` (the deletion glob), `packages/nextjs/src/config/withSentryConfig/getFinalConfigObjectBundlerUtils.ts` in `maybeEnableTurbopackSourcemaps` (no check of the hook).
- React Router: `packages/react-router/src/vite/plugin.ts:27-30` (no `disable` check before maps are turned on), `packages/react-router/src/vite/buildEnd/handleOnBuildEnd.ts:87-150` (injection, upload, default glob).
- SvelteKit: `packages/sveltekit/src/vite/sourceMaps.ts:70-82` (option mapping), `:118-160` (hidden maps and default glob), `packages/sveltekit/src/vite/sentryVitePlugins.ts:304-320` (`autoUploadSourceMaps`).
- SolidStart: `packages/solidstart/src/vite/sourceMaps.ts:40` (glob `.*/**/*.map`), `:125` (glob `./**/*.map`), `packages/solidstart/src/vite/sentrySolidStart.ts:58`, `sentrySolidStartVite.ts:32` (plugin not added).
- Nitro: `packages/nitro/src/sourceMaps.ts:28-31`, `:55-61`, `:84-124`.
- Nuxt: `packages/nuxt/src/vite/sourceMaps.ts:41` (plugin not added), `:57-58` (when the SDK deletes), `packages/nuxt/src/vite/sourceMapDeletion.ts:24-37` (the globs).
- Astro: `packages/astro/src/integration/index.ts:64` (plugin not added), `:73-83` (the four globs under `./dist`).
- Remix: `packages/remix/src/vite/sourceMaps.ts:40-64` (default glob), `packages/remix/src/vite/index.ts:51-55` (plugin order, `disable` check).
- TanStack Start: `packages/tanstackstart-react/src/vite/sourceMaps.ts:73-85`, `:145-155` (default globs), `packages/tanstackstart-react/src/vite/sentryTanstackStart.ts:126` (both `disable` values stop the SDK from turning maps on).
- Gatsby: `packages/gatsby/gatsby-node.js:11-34`.
- Bundler plugins: `packages/bundler-plugins/src/core/sourcemap-settings.ts:46-151` (the decision), `packages/bundler-plugins/src/core/build-plugin-manager.ts:698-740` (direct mode), `:1009-1039` (`filesToDeleteAfterUpload`), `packages/bundler-plugins/src/bun/index.ts:119-161`.

Nothing in this document comes from a real build. All of it comes from reading the code. The four leaks in TL;DR item 2 are also stated in the descriptions of the PRs that fix them.

---

## 8. Not confirmed

These points depend on code outside this repo (frameworks, bundlers, the CLI package), which was not read. The cells that rest on them say so in the evidence reports.

- **Nuxt.** How Nuxt maps `sourcemap.client` and `sourcemap.server` to Vite and to Nitro's Rollup config. What `addVitePlugin` does with the webpack or rspack builder. Whether the `nitro:*` hooks fire with the Nuxt Vite server. Nuxt's own default (`server: true`, `client: false`) is stated in repo comments and in the E2E app, not read from Nuxt.
- **Next.js.** Which `devtool` Next.js sets for `productionBrowserSourceMaps` and `experimental.serverSourceMaps` under webpack. Whether Turbopack writes server maps by default. Whether Next.js calls `runAfterProductionCompile` in development. For webpack+hook: whether the delete default, which is written inside the client webpack function, reaches the hook.
- **Astro.** Which Vite builds Astro runs, their output folders, and the folder layouts of the Cloudflare and Vercel adapters.
- **SvelteKit.** That the adapter has run before the deferred upload. Whether `sorcery` keeps the stamped debug ID fields in the maps.
- **SolidStart.** Which vinxi routers (SolidStart 1) and which Vite environments (SolidStart 2) run the Sentry Vite plugin. Which files the default globs `.*/**/*.map` and `./**/*.map` match in a real build; the statement that `./**/*.map` skips dot folders comes from the glob call (no `dot` option) and from the E2E app of [#26335].
- **TanStack Start.** That `nitro/vite` copies Nitro's source map setting to the `ssr` and `nitro` environments. All `nitro` cells rest on it; the SDK comment, a unit test and the E2E app agree with it.
- **Remix.** That Remix runs separate client and SSR Vite builds with their own output folders.
- **React Router.** Whether the `sentry` CLI package reads `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` itself, and whether its upload throws without a token.
- **Gatsby.** Which webpack stages other than `build-javascript` run in a production build, and whether the fixed relative `ignore` patterns match files inside `public/`.
- **CLI.** Whether `sourcemap inject` works without an auth token. What the CLI does with a glob or a single file where it expects a folder (direct-mode `assets`).
- **Bundlers.** Whether Bun writes a debug ID into its own map files. That the Vite dev server calls no output hooks. webpack with an in-memory output file system. Watch mode for every bundler, which has no fixture.

[#26332]: https://github.com/getsentry/sentry-javascript/pull/26332
[#26333]: https://github.com/getsentry/sentry-javascript/pull/26333
[#26334]: https://github.com/getsentry/sentry-javascript/pull/26334
[#26335]: https://github.com/getsentry/sentry-javascript/pull/26335
[#26336]: https://github.com/getsentry/sentry-javascript/pull/26336
[#26337]: https://github.com/getsentry/sentry-javascript/pull/26337
[#26338]: https://github.com/getsentry/sentry-javascript/pull/26338
