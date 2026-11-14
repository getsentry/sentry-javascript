# Astro and SvelteKit

Worktree: `.claude/worktrees/astro-delete-sourcemaps-537b3c`. `HEAD` = develop plus the Astro PR (`03a9d1ae42`). The PR changes `packages/astro/src/integration/index.ts` only (plus tests). `packages/sveltekit`, `packages/bundler-plugins` and `packages/core` are the same on `HEAD` and `HEAD~1`, so SvelteKit cells have no "develop:" line.

Line numbers are at `HEAD`. "HEAD~1" before a path marks a develop line number.

Plugin facts used in many cells (both columns use the Vite plugin):

- The Vite plugin is two plugins: `sentry-vite-plugin` (`enforce: 'pre'`: `buildStart`, `transform`, `configResolved`, `renderChunk`, `generateBundle` pre, `writeBundle`) and `sentry-vite-upload-staging` (`enforce: 'post'`: `config`, `generateBundle` post). packages/bundler-plugins/src/rollup/index.ts:324-354, packages/bundler-plugins/src/vite/index.ts:25-35
- The source map decision is made in the post plugin's `config` hook from the merged `build.sourcemap`. packages/bundler-plugins/src/vite/source-map-hooks.ts:78-112
- Staging runs only when the decision says delete and an upload can run. If the decision says delete and no upload can run, the maps are dropped from the bundle and nothing is uploaded. packages/bundler-plugins/src/rollup/source-map-handling.ts:226-245
- `writeBundle` does, in order: take staging, `createRelease()`, upload (unless `sourcemaps.disable` is set), and in `finally` `deleteArtifacts()` (the `filesToDeleteAfterUpload` globs). The glob deletion runs also when no upload ran. packages/bundler-plugins/src/rollup/index.ts:268-308
- Uploads go through the `sentry` CLI package. packages/bundler-plugins/src/core/cli.ts:1, packages/bundler-plugins/src/core/build-plugin-manager.ts:833-841

## Column: Astro

### Matrix A

| # | Option | Value | Note | Evidence |
|---|---|---|---|---|
| 1 | `sourcemaps.disable` | `true`: turned into something else. `'disable-upload'`: passed through | `true`: the SDK does not add the Vite plugin and does not touch `vite.build.sourcemap`. `'disable-upload'`: the plugin stamps debug IDs and does not upload. | packages/astro/src/integration/index.ts:64, packages/astro/src/integration/index.ts:67, packages/astro/src/integration/index.ts:107; packages/bundler-plugins/src/rollup/index.ts:261-265, packages/bundler-plugins/src/rollup/index.ts:275 |
| 2 | `sourcemaps.assets` | default set by SDK; user value replaces default | Default `['<outDir>/**/*', '<outDir>/**/.prerender/**/*']`. `<outDir>` is `config.outDir` relative to the root, else `dist`. Vercel adapter: `{.vercel,dist}`. | packages/astro/src/integration/index.ts:108, packages/astro/src/integration/index.ts:355-383 |
| 3 | `sourcemaps.ignore` | passed through | Spread of `sourcemaps`. | packages/astro/src/integration/index.ts:107 |
| 4 | `sourcemaps.filesToDeleteAfterUpload` | passed through | When set, it also turns off the SDK default of row 5. The plugin deletes the globs from disk at the end of each Vite build's `writeBundle`. develop: default set by SDK; user value replaces default. Default: `./dist/**/client/**/*.map`, `./dist/**/server/**/*.map`, `./dist/**/<build.assets or _astro>/**/*.map`, `./dist/**/.prerender/**/*.map`, only when the user's `vite.build.sourcemap` is unset. | packages/astro/src/integration/index.ts:107, packages/astro/src/integration/index.ts:76; packages/bundler-plugins/src/rollup/index.ts:304-307, packages/bundler-plugins/src/core/build-plugin-manager.ts:1009-1031. develop: HEAD~1 packages/astro/src/integration/index.ts:72-84, HEAD~1 packages/astro/src/integration/index.ts:122 |
| 5 | `sourcemaps.deleteSourcemapsAfterUpload` | default set by SDK; user value replaces default | Default: a function that returns `true`, or `undefined` when the Vite build's `outDir` ends in `_worker.js`. Set only when the SDK turned the maps on and the user gave no `filesToDeleteAfterUpload`. The SDK also sets `sdkEnabledSourceMaps` (true when the user's `vite.build.sourcemap` was unset). develop: passed through (spread), no default, no `sdkEnabledSourceMaps`. | packages/astro/src/integration/index.ts:70, packages/astro/src/integration/index.ts:74-78, packages/astro/src/integration/index.ts:109-110, packages/astro/src/integration/index.ts:280. develop: HEAD~1 packages/astro/src/integration/index.ts:120 |
| 6 | `sourcemaps.rewriteSources` | passed through | Used on the staged route and the disk route. | packages/astro/src/integration/index.ts:107; packages/bundler-plugins/src/core/build-plugin-manager.ts:887, packages/bundler-plugins/src/core/build-plugin-manager.ts:788 |
| 7 | `sourcemaps.resolveSourceMap` | passed through | Only the disk route calls it. Staged chunks take the map from the bundle, so the hook does not run for them. | packages/astro/src/integration/index.ts:107; packages/bundler-plugins/src/core/build-plugin-manager.ts:789, packages/bundler-plugins/src/rollup/source-map-handling.ts:255-258 |
| 8 | `release.inject` | passed through | The `release` object is handed over as is. Plugin default `true`. | packages/astro/src/integration/index.ts:105; packages/bundler-plugins/src/core/options-mapping.ts:118 |
| 9 | `release.name`, `create`, `finalize`, `dist`, `setCommits`, `deploy` | passed through | No SDK default. Plugin defaults apply. `release.name` is also written into the default client and server init snippets. | packages/astro/src/integration/index.ts:105; packages/bundler-plugins/src/core/options-mapping.ts:115-127; packages/astro/src/integration/snippets.ts:41-43 |
| 10 | `org`, `project`, `authToken`, `sentryUrl` | default set by SDK; user value replaces default | Defaults: `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `SENTRY_URL` from `process.env`. `sentryUrl` is renamed to `url`. | packages/astro/src/integration/index.ts:30, packages/astro/src/integration/index.ts:91-94 |
| 11 | `bundleSizeOptimizations` | passed through | Shallow copy. `excludeTracing` also removes `browserTracingIntegration` from the default client init snippet. Never applied when the plugin is not added (row 1 `true`, dev, `enabled: false`). | packages/astro/src/integration/index.ts:112-114; packages/astro/src/integration/snippets.ts:53; packages/astro/src/integration/index.ts:67 |
| 12 | `applicationKey`, `moduleMetadata` | passed through | Never applied when the plugin is not added. | packages/astro/src/integration/index.ts:88-89, packages/astro/src/integration/index.ts:67 |
| 13 | `debug`, `silent`, `telemetry`, `errorHandler` | default set by SDK (three of four); user value replaces default | `debug: false`, `silent: false`, `telemetry: true`. `errorHandler` passed through. | packages/astro/src/integration/index.ts:96-98, packages/astro/src/integration/index.ts:104 |
| 14 | SDK-only options | see note | `enabled` (default `true` for client and server): when both are off, no plugin and no source map change. `headers`: passed through. Removed keys `sourceMapsUploadOptions` and `unstable_sentryVitePluginOptions`: warning, ignored. There is no `autoUploadSourceMaps` option. | packages/astro/src/integration/index.ts:58-64, packages/astro/src/integration/index.ts:95, packages/astro/src/integration/index.ts:54-56; packages/astro/src/integration/types.ts:72 |
| 15 | Extra keys | top level: no. Nested: yes | Top level is an explicit key list, so `disable`, `reactComponentAnnotation`, `_experiments` do not reach the plugin. `sourcemaps` and `bundleSizeOptimizations` are spread and `release` is the user's object, so extra nested keys reach the plugin (for example `release.uploadLegacySourcemaps`). A user's `sourcemaps.sdkEnabledSourceMaps` is overwritten. | packages/astro/src/integration/index.ts:87-115 |

### Matrix B

Astro runs several Vite builds with the one config the SDK updates. Which builds exist, and their `outDir`, is decided in Astro and its adapters (not read). The Astro 7 e2e app records three environments: `client`, `ssr`, `prerender` (`dev-packages/e2e-tests/test-applications/astro-7-sourcemaps/assert-build.ts:26`).

#### S1 Default build

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. Added when `enabled` is on for client or server, `sourcemaps.disable !== true` and `command !== 'dev'`. | packages/astro/src/integration/index.ts:63-67, packages/astro/src/integration/index.ts:85-87 |
| b | `vite.build.sourcemap: 'hidden'`. One top-level setting, so every Vite build that Astro runs (client, server, prerender). | packages/astro/src/integration/index.ts:83, packages/astro/src/integration/index.ts:440-442 |
| c | Yes, in `renderChunk`. | packages/bundler-plugins/src/rollup/index.ts:220-223 |
| d | Staged from memory in `generateBundle` (post), uploaded in `writeBundle`. JS files on disk that match `assets` and were not staged are also read from disk. develop: read from disk by the plugin, no staging. | packages/bundler-plugins/src/core/sourcemap-settings.ts:129-133, packages/bundler-plugins/src/rollup/source-map-handling.ts:247-274, packages/bundler-plugins/src/rollup/index.ts:269, packages/bundler-plugins/src/rollup/index.ts:294, packages/bundler-plugins/src/core/build-plugin-manager.ts:753-760. develop: HEAD~1 packages/astro/src/integration/index.ts:119-123, packages/bundler-plugins/src/core/sourcemap-settings.ts:129-132 |
| e | The plugin removes all maps before write, JS maps and other asset maps (for example CSS). Exception: a Vite build whose `outDir` ends in `_worker.js` (older Cloudflare adapter) keeps its maps, and they are uploaded from disk. develop: SDK glob through `filesToDeleteAfterUpload` (4 globs under `./dist`, see Matrix A row 4), deleted from disk after each `writeBundle`. Maps outside those globs stay. | packages/astro/src/integration/index.ts:74-78, packages/astro/src/integration/index.ts:280, packages/bundler-plugins/src/rollup/source-map-handling.ts:230-235, packages/bundler-plugins/src/rollup/source-map-handling.ts:271-274. develop: HEAD~1 packages/astro/src/integration/index.ts:72-84, packages/bundler-plugins/src/rollup/index.ts:304-307 |
| f | nothing | packages/astro/src/integration/index.ts:87-115 |

#### S2 User turned source maps on

`true`, `'hidden'` and `'inline'` get the same SDK handling.

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | packages/astro/src/integration/index.ts:67 |
| b | none. The SDK keeps the user's value. | packages/astro/src/integration/index.ts:432-434 |
| c | Yes. | packages/bundler-plugins/src/rollup/index.ts:220-223 |
| d | Read from disk by the plugin in `writeBundle`, with the `assets` globs. | packages/bundler-plugins/src/core/sourcemap-settings.ts:129-138, packages/bundler-plugins/src/core/build-plugin-manager.ts:743-755, packages/bundler-plugins/src/core/build-plugin-manager.ts:782-790 |
| e | None. All maps stay. `sdkEnabledSourceMaps` is false and the delete option is `undefined`. | packages/astro/src/integration/index.ts:70, packages/astro/src/integration/index.ts:74-78, packages/bundler-plugins/src/core/sourcemap-settings.ts:129-138 |
| f | nothing | packages/astro/src/integration/index.ts:87-115 |

#### S3 User turned source maps off

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. The SDK does not check for `false` before it adds the plugin. | packages/astro/src/integration/index.ts:64-67 |
| b | none. The SDK keeps `false` and logs a warning. | packages/astro/src/integration/index.ts:420-431 |
| c | Yes. Injection does not depend on maps. | packages/bundler-plugins/src/rollup/index.ts:220-223 |
| d | Nothing. The upload step runs, skips each JS file without a map and warns. | packages/bundler-plugins/src/core/debug-id-upload.ts:74-85, packages/bundler-plugins/src/core/build-plugin-manager.ts:824-831 |
| e | None exist. | packages/astro/src/integration/index.ts:420-422 |
| f | nothing. The plugin also warns. | packages/bundler-plugins/src/core/sourcemap-settings.ts:84-93 |

#### S4 No auth token

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. The SDK does not check the token. The plugin's upload is blocked. | packages/astro/src/integration/index.ts:66-67, packages/bundler-plugins/src/core/build-plugin-manager.ts:1063-1065 |
| b | `'hidden'`, as S1. | packages/astro/src/integration/index.ts:83, packages/astro/src/integration/index.ts:440-442 |
| c | Yes. | packages/bundler-plugins/src/rollup/index.ts:220-223 |
| d | Nothing. Warning. | packages/bundler-plugins/src/core/build-plugin-manager.ts:674-677, packages/bundler-plugins/src/core/build-plugin-manager.ts:1086-1090 |
| e | The plugin removes all maps before write, with no upload. A `_worker.js` build keeps its maps. develop: maps are written, then the SDK glob deletes them from disk (`deleteArtifacts` runs in `finally`). | packages/bundler-plugins/src/core/sourcemap-settings.ts:55-80, packages/bundler-plugins/src/rollup/source-map-handling.ts:237-245, packages/astro/src/integration/index.ts:77. develop: HEAD~1 packages/astro/src/integration/index.ts:72-84, packages/bundler-plugins/src/rollup/index.ts:304-307 |
| f | Release creation is skipped. Release injection stays. | packages/bundler-plugins/src/core/build-plugin-manager.ts:538-542, packages/bundler-plugins/src/rollup/index.ts:132-145 |

#### S5 `sourcemaps.disable: true`

| Point | Answer | Evidence |
|---|---|---|
| a | No. | packages/astro/src/integration/index.ts:64, packages/astro/src/integration/index.ts:67 |
| b | none. `vite.build.sourcemap` is not touched. | packages/astro/src/integration/index.ts:67-68 |
| c | No. | packages/astro/src/integration/index.ts:67 |
| d | Nothing. | packages/astro/src/integration/index.ts:67 |
| e | None. | packages/astro/src/integration/index.ts:67 |
| f | Everything the plugin does: release injection, release creation, `bundleSizeOptimizations`, `applicationKey`, `moduleMetadata`. | packages/astro/src/integration/index.ts:67-119 |

#### S6 `sourcemaps.disable: 'disable-upload'`

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. Only `true` is checked. | packages/astro/src/integration/index.ts:64-67 |
| b | `'hidden'`, as S1. | packages/astro/src/integration/index.ts:83, packages/astro/src/integration/index.ts:440-442 |
| c | Yes. Also stamped into the emitted chunks (`//# debugId=`) and maps in `generateBundle`. | packages/bundler-plugins/src/rollup/index.ts:220-223, packages/bundler-plugins/src/rollup/index.ts:261-265, packages/bundler-plugins/src/rollup/index.ts:344-349 |
| d | Nothing. | packages/bundler-plugins/src/rollup/index.ts:275, packages/bundler-plugins/src/rollup/index.ts:295-298 |
| e | The plugin removes all maps before write, after the stamping. No map is left for an upload by hand. A `_worker.js` build keeps its maps. develop: maps are written, then the SDK glob deletes them from disk. | packages/bundler-plugins/src/core/sourcemap-settings.ts:55-80, packages/bundler-plugins/src/rollup/source-map-handling.ts:237-245, packages/astro/src/integration/index.ts:74-78. develop: HEAD~1 packages/astro/src/integration/index.ts:72-84, packages/bundler-plugins/src/rollup/index.ts:304-307 |
| f | nothing. Release creation still runs. | packages/bundler-plugins/src/rollup/index.ts:273 |

#### S7 User sets `filesToDeleteAfterUpload`

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | packages/astro/src/integration/index.ts:67 |
| b | `'hidden'`, as S1. | packages/astro/src/integration/index.ts:83, packages/astro/src/integration/index.ts:440-442 |
| c | Yes. | packages/bundler-plugins/src/rollup/index.ts:220-223 |
| d | Read from disk by the plugin. The SDK default of the delete option is off, so the decision is "no change". | packages/astro/src/integration/index.ts:74-78, packages/bundler-plugins/src/core/sourcemap-settings.ts:129-132, packages/bundler-plugins/src/core/build-plugin-manager.ts:743-755 |
| e | Only files that match the user's glob, deleted from disk by the plugin at the end of each Vite build's `writeBundle`. Other maps stay. | packages/astro/src/integration/index.ts:107, packages/bundler-plugins/src/rollup/index.ts:304-307, packages/bundler-plugins/src/core/build-plugin-manager.ts:1009-1031 |
| f | nothing | packages/astro/src/integration/index.ts:87-115 |

#### S8 `deleteSourcemapsAfterUpload: true` with S2

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | packages/astro/src/integration/index.ts:67 |
| b | none by the SDK. The plugin switches `true` to `'hidden'`. A user's `'hidden'` stays. | packages/astro/src/integration/index.ts:432-434, packages/bundler-plugins/src/core/sourcemap-settings.ts:135-149, packages/bundler-plugins/src/vite/source-map-hooks.ts:91 |
| c | Yes. | packages/bundler-plugins/src/rollup/index.ts:220-223 |
| d | Staged from memory. JS files on disk that match `assets` and were not staged are also read from disk. | packages/bundler-plugins/src/rollup/source-map-handling.ts:247-274, packages/bundler-plugins/src/core/build-plugin-manager.ts:753-760 |
| e | The plugin removes before write the maps of the JS chunks it staged. Maps of chunks that `assets` or `ignore` exclude, and non-JS maps (CSS), stay (`removeAllSourceMaps` is false). The user's `true` also applies to a `_worker.js` build. | packages/astro/src/integration/index.ts:70, packages/astro/src/integration/index.ts:75, packages/bundler-plugins/src/core/sourcemap-settings.ts:133, packages/bundler-plugins/src/core/sourcemap-settings.ts:142, packages/bundler-plugins/src/rollup/source-map-handling.ts:271-274 |
| f | nothing | packages/astro/src/integration/index.ts:87-115 |

#### S9 `deleteSourcemapsAfterUpload: false`

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | packages/astro/src/integration/index.ts:67 |
| b | `'hidden'`, as S1. | packages/astro/src/integration/index.ts:83, packages/astro/src/integration/index.ts:440-442 |
| c | Yes. | packages/bundler-plugins/src/rollup/index.ts:220-223 |
| d | Read from disk by the plugin. | packages/bundler-plugins/src/core/sourcemap-settings.ts:129-132, packages/bundler-plugins/src/core/build-plugin-manager.ts:743-755 |
| e | None. All maps stay. develop: the SDK glob still deletes them; the develop code does not read this option when it sets the glob. | packages/astro/src/integration/index.ts:75, packages/bundler-plugins/src/core/sourcemap-settings.ts:129-132. develop: HEAD~1 packages/astro/src/integration/index.ts:72-84 |
| f | nothing | packages/astro/src/integration/index.ts:87-115 |

#### S10 Development mode

Detection: `command !== 'dev'`, from the `astro:config:setup` hook arguments.

| Point | Answer | Evidence |
|---|---|---|
| a | No. | packages/astro/src/integration/index.ts:22, packages/astro/src/integration/index.ts:67 |
| b | none | packages/astro/src/integration/index.ts:67-68 |
| c | No. | packages/astro/src/integration/index.ts:67 |
| d | Nothing. | packages/astro/src/integration/index.ts:67 |
| e | None. | packages/astro/src/integration/index.ts:67 |
| f | Everything the plugin does, as S5. Separate from this, in a build with `NODE_ENV=development` the plugin itself does not upload, does not create a release and removes no maps. | packages/astro/src/integration/index.ts:67-119; packages/bundler-plugins/src/core/build-plugin-manager.ts:323, packages/bundler-plugins/src/core/build-plugin-manager.ts:975-977, packages/bundler-plugins/src/core/build-plugin-manager.ts:1060-1062, packages/bundler-plugins/src/core/build-plugin-manager.ts:535-537 |

### Mechanics

| Item | Answer | Evidence |
|---|---|---|
| Plugin entry | `sentryVitePlugin` from `@sentry/bundler-plugins/vite` | packages/astro/src/integration/index.ts:1, packages/astro/src/integration/index.ts:87 |
| Builds | Added to the shared Vite config with `updateConfig`, so every Vite build Astro runs. No per-environment filter in the SDK. A helper plugin records per build whether `outDir` ends in `_worker.js`. | packages/astro/src/integration/index.ts:80-118, packages/astro/src/integration/index.ts:274-283 |
| When the upload runs | Inside the bundler, in `writeBundle` of each Vite build. | packages/bundler-plugins/src/rollup/index.ts:268-308 |
| Option mapping | Explicit key list at the top level. `sourcemaps` and `bundleSizeOptimizations` are spread. `release` is passed as the user's object. | packages/astro/src/integration/index.ts:87-115 |
| Development mode | `command !== 'dev'` in `astro:config:setup`. | packages/astro/src/integration/index.ts:22, packages/astro/src/integration/index.ts:67 |

## Column: SvelteKit

What still runs inside the build, and what the deferred call does:

- `makeCustomSentryVitePlugins` calls `sentryVitePlugin`, finds `sentry-vite-plugin` and replaces it with a copy without `writeBundle`. All its other hooks stay: `buildStart` (telemetry), `transform` (only with `bundleSizeOptimizations` or component annotation), `configResolved` (records decisions), `renderChunk` (release, module metadata and debug ID injection), `generateBundle` pre (debug ID stamping for `'disable-upload'`). packages/sveltekit/src/vite/sourceMaps.ts:87-111, packages/bundler-plugins/src/rollup/index.ts:324-334
- `sentry-vite-upload-staging` stays unchanged: `config` (decision) and `generateBundle` post. Because the SDK forces `deleteSourcemapsAfterUpload: false`, the decision never says delete, so this plugin never stages and never drops a map. packages/sveltekit/src/vite/sourceMaps.ts:80, packages/sveltekit/src/vite/sourceMaps.ts:105, packages/bundler-plugins/src/core/sourcemap-settings.ts:106-138, packages/bundler-plugins/src/rollup/source-map-handling.ts:226-228
- The SDK adds three plugins, all `apply: 'build'`: one sets `build.sourcemap`, one resolves the `filesToDeleteAfterUpload` promise in `configResolved`, one starts the upload. packages/sveltekit/src/vite/sourceMaps.ts:118-131, packages/sveltekit/src/vite/sourceMaps.ts:133-162, packages/sveltekit/src/vite/sourceMaps.ts:244-277
- Deferred call, once, after the adapter: read the JS files in the adapter output dir, flatten their maps with `sorcery`, strip the auto-instrument module suffix from the maps, then call the original `writeBundle({ dir: outDir })` with no bundle. packages/sveltekit/src/vite/sourceMaps.ts:169-229
- That `writeBundle` call: `takeStaging` finds nothing; `createRelease()`; glob `**/*.js`, `.mjs`, `.cjs` and their `.map` files in `outDir`; `uploadSourcemaps` (disk route, copies prepared in a temp folder); in `finally`, `deleteArtifacts()` awaits the promise and deletes the globs. Anything it throws is caught by the SDK and logged. packages/bundler-plugins/src/rollup/source-map-handling.ts:309-315, packages/bundler-plugins/src/rollup/index.ts:269-307, packages/sveltekit/src/vite/sourceMaps.ts:230-241
- Trigger: Kit 2: `closeBundle` of the build whose resolved config has `build.ssr` true. Kit 3: post `buildApp` hook, once, when at least one environment is built. That the adapter has run by then comes from the SDK's comments; Kit's code was not read. packages/sveltekit/src/vite/sourceMaps.ts:248-276
- Adapter output dir: `node`: the adapter's `out` (default `build`). `cloudflare`: `<kit.outDir>/cloudflare`. `auto`, `vercel`, `other`: `<kit.outDir>/output` (Kit's own build output, default `.svelte-kit/output`). packages/sveltekit/src/vite/svelteConfig.ts:80-95, packages/sveltekit/src/vite/svelteConfig.ts:105-118

### Matrix A

| # | Option | Value | Note | Evidence |
|---|---|---|---|---|
| 1 | `sourcemaps.disable` | passed through (both values) | The SDK never reads it. It still sets hidden maps and still runs its deletion default (row 4). `true`: the plugin injects no debug IDs and does not upload. `'disable-upload'`: debug IDs stamped, no upload. | packages/sveltekit/src/vite/sentryVitePlugins.ts:343-347, packages/sveltekit/src/vite/sourceMaps.ts:77-78, packages/sveltekit/src/vite/sourceMaps.ts:121-130, packages/sveltekit/src/vite/sourceMaps.ts:143-157; packages/bundler-plugins/src/rollup/index.ts:127, packages/bundler-plugins/src/rollup/index.ts:220, packages/bundler-plugins/src/rollup/index.ts:261-265, packages/bundler-plugins/src/rollup/index.ts:275 |
| 2 | `sourcemaps.assets` | passed through | When unset, the deferred `writeBundle` globs JS and map files in the adapter output dir. When set, the user's globs replace that list. | packages/sveltekit/src/vite/sentryVitePlugins.ts:343-347, packages/sveltekit/src/vite/sourceMaps.ts:172, packages/sveltekit/src/vite/sourceMaps.ts:228; packages/bundler-plugins/src/rollup/index.ts:277-287, packages/bundler-plugins/src/core/build-plugin-manager.ts:743-751 |
| 3 | `sourcemaps.ignore` | passed through | | packages/sveltekit/src/vite/sentryVitePlugins.ts:343-347; packages/bundler-plugins/src/core/build-plugin-manager.ts:753-755 |
| 4 | `sourcemaps.filesToDeleteAfterUpload` | default set by SDK; user value replaces default | The SDK always gives the plugin a Promise. It resolves to the user's value when given. Else, when the user's `build.sourcemap` was unset, to `['./.*/**/*.map', './<adapterOutputDir>/**/*.map']`. Else to `undefined` (also when the user set `build.sourcemap: false`). | packages/sveltekit/src/vite/sourceMaps.ts:63-68, packages/sveltekit/src/vite/sourceMaps.ts:79, packages/sveltekit/src/vite/sourceMaps.ts:122, packages/sveltekit/src/vite/sourceMaps.ts:141-160 |
| 5 | `sourcemaps.deleteSourcemapsAfterUpload` | forced | Forced value `false`. | packages/sveltekit/src/vite/sourceMaps.ts:77-81 |
| 6 | `sourcemaps.rewriteSources` | passed through | Applied on the disk route. | packages/sveltekit/src/vite/sentryVitePlugins.ts:343-347; packages/bundler-plugins/src/core/build-plugin-manager.ts:788 |
| 7 | `sourcemaps.resolveSourceMap` | passed through | Applied on the disk route. | packages/sveltekit/src/vite/sentryVitePlugins.ts:343-347; packages/bundler-plugins/src/core/build-plugin-manager.ts:789 |
| 8 | `release.inject` | passed through | Plugin default `true`. | packages/sveltekit/src/vite/sentryVitePlugins.ts:349-353, packages/sveltekit/src/vite/sourceMaps.ts:73-76; packages/bundler-plugins/src/core/options-mapping.ts:118 |
| 9 | `release.name`, `create`, `finalize`, `dist`, `setCommits`, `deploy` | `release.name`: default set by SDK; user value replaces default. Others: passed through | Default name: `getSentryRelease()` (`SENTRY_RELEASE`, a global release, CI commit env vars), else `git rev-parse HEAD`, else a random UUID. | packages/sveltekit/src/vite/sourceMaps.ts:23, packages/sveltekit/src/vite/sourceMaps.ts:52-55, packages/sveltekit/src/vite/sourceMaps.ts:73-76, packages/sveltekit/src/vite/sourceMaps.ts:364-381; `packages/node/src/sdk/api.ts:11-23` |
| 10 | `org`, `project`, `authToken`, `sentryUrl` | passed through; `sentryUrl` turned into something else | `sentryUrl` is renamed to `url`. No SDK default; the plugin reads the `SENTRY_*` env vars. | packages/sveltekit/src/vite/sentryVitePlugins.ts:320-341; packages/bundler-plugins/src/core/options-mapping.ts:98-107 |
| 11 | `bundleSizeOptimizations` | passed through | Shallow copy. This option alone makes the SDK create the Sentry Vite plugin, also with `autoUploadSourceMaps: false` or `NODE_ENV=development`. | packages/sveltekit/src/vite/sentryVitePlugins.ts:310-316, packages/sveltekit/src/vite/sentryVitePlugins.ts:104-109 |
| 12 | `applicationKey`, `moduleMetadata` | passed through | By object spread. Never applied when `autoUploadSourceMaps` is `false` or `NODE_ENV` is `development`: the spread does not run then. | packages/sveltekit/src/vite/sentryVitePlugins.ts:319-336 |
| 13 | `debug`, `silent`, `telemetry`, `errorHandler` | `debug`: default set by SDK; user value replaces default. Others: passed through | `debug: false`. `silent`, `telemetry`, `errorHandler` go through the spread, with the same "never applied" condition as row 12. Errors that the deferred `writeBundle` throws are caught by the SDK and logged, so they do not stop the build. | packages/sveltekit/src/vite/sentryVitePlugins.ts:17-21, packages/sveltekit/src/vite/sentryVitePlugins.ts:49-52, packages/sveltekit/src/vite/sentryVitePlugins.ts:340, packages/sveltekit/src/vite/sentryVitePlugins.ts:329-336; packages/sveltekit/src/vite/sourceMaps.ts:230-241 |
| 14 | SDK-only options | see note | `autoUploadSourceMaps` (default `true`): `false` stops the option spread, so only `bundleSizeOptimizations` reaches the plugin; without it no Sentry Vite plugin exists. It does not stop the SDK's source map plugins or the deferred call when the plugin exists (see Surprises). `adapter` (default: detected from the Kit config, then `package.json`): picks the folder for the upload glob and the deletion glob. `autoInstrument`: not a source map option; the upload step strips its module suffix from the maps. Removed key `unstable_sentryVitePluginOptions`: warning. | packages/sveltekit/src/vite/sentryVitePlugins.ts:18, packages/sveltekit/src/vite/sentryVitePlugins.ts:319, packages/sveltekit/src/vite/sentryVitePlugins.ts:104-109, packages/sveltekit/src/vite/sentryVitePlugins.ts:39-47, packages/sveltekit/src/vite/sentryVitePlugins.ts:31; packages/sveltekit/src/vite/detectAdapter.ts:31-75; packages/sveltekit/src/vite/svelteConfig.ts:80-95; packages/sveltekit/src/vite/sourceMaps.ts:209-217; packages/sveltekit/src/vite/types.ts:10-46 |
| 15 | Extra keys | yes | `...newSvelteKitPluginOptions`, then `...options`. `sourcemaps` and `release` are spread too. Keys outside the type reach the plugin, for example `disable`, `reactComponentAnnotation`, `_experiments`, `release.uploadLegacySourcemaps`. With `disable: true` the plugin returns a no-op, the SDK does not find `sentry-vite-plugin` and adds none of its own source map plugins. | packages/sveltekit/src/vite/sentryVitePlugins.ts:320-353, packages/sveltekit/src/vite/sourceMaps.ts:70-82, packages/sveltekit/src/vite/sourceMaps.ts:91-103; packages/bundler-plugins/src/core/options-mapping.ts:113, packages/bundler-plugins/src/core/options-mapping.ts:129, packages/bundler-plugins/src/core/options-mapping.ts:138, packages/bundler-plugins/src/rollup/index.ts:112-119 |

### Matrix B

All rows assume `autoUploadSourceMaps` is on and `NODE_ENV` is not `development`.

#### S1 Default build

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. The plugin runs in the build without `writeBundle`. The SDK calls `writeBundle` once after the adapter. | packages/sveltekit/src/vite/sourceMaps.ts:87, packages/sveltekit/src/vite/sourceMaps.ts:108-111, packages/sveltekit/src/vite/sourceMaps.ts:226-229 |
| b | `build.sourcemap: 'hidden'`, set by an SDK plugin's `config` hook. Top-level setting, so client and server. The Sentry plugin itself turns nothing on. | packages/sveltekit/src/vite/sourceMaps.ts:118-131, packages/sveltekit/src/vite/sourceMaps.ts:336-337; packages/bundler-plugins/src/core/sourcemap-settings.ts:129-132 |
| c | Yes, in `renderChunk`. | packages/bundler-plugins/src/rollup/index.ts:220-223, packages/sveltekit/src/vite/sourceMaps.ts:111 |
| d | Read from disk by the plugin, after the adapter: JS and map files in the adapter output dir, prepared in a temp folder. Before that the SDK rewrites the maps on disk with `sorcery`. | packages/sveltekit/src/vite/sourceMaps.ts:172-229; packages/bundler-plugins/src/rollup/index.ts:277-294; packages/bundler-plugins/src/core/build-plugin-manager.ts:743-790 |
| e | SDK glob through `filesToDeleteAfterUpload`: `./.*/**/*.map` and `./<adapterOutputDir>/**/*.map`, deleted from disk by the plugin after the upload. Maps outside the hidden top-level folders and the adapter output dir stay. Nothing is removed before write. | packages/sveltekit/src/vite/sourceMaps.ts:143-157; packages/bundler-plugins/src/rollup/index.ts:304-307; packages/bundler-plugins/src/core/build-plugin-manager.ts:1009-1031; packages/bundler-plugins/src/rollup/source-map-handling.ts:226-228 |
| f | nothing | packages/sveltekit/src/vite/sentryVitePlugins.ts:320-341 |

#### S2 User turned source maps on

`true`, `'hidden'` and `'inline'` get the same SDK handling.

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | packages/sveltekit/src/vite/sourceMaps.ts:87 |
| b | none. The SDK keeps the user's value. | packages/sveltekit/src/vite/sourceMaps.ts:328-329 |
| c | Yes. | packages/bundler-plugins/src/rollup/index.ts:220-223 |
| d | Read from disk by the plugin, as S1. | packages/sveltekit/src/vite/sourceMaps.ts:172-229; packages/bundler-plugins/src/core/build-plugin-manager.ts:743-790 |
| e | None. The promise resolves to `undefined` because the user set `build.sourcemap`. All maps stay. | packages/sveltekit/src/vite/sourceMaps.ts:122, packages/sveltekit/src/vite/sourceMaps.ts:143, packages/sveltekit/src/vite/sourceMaps.ts:159 |
| f | nothing | packages/sveltekit/src/vite/sentryVitePlugins.ts:320-341 |

#### S3 User turned source maps off

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | packages/sveltekit/src/vite/sourceMaps.ts:87 |
| b | none. The SDK keeps `false` and warns. | packages/sveltekit/src/vite/sourceMaps.ts:315-327 |
| c | Yes. Injection does not depend on maps. | packages/bundler-plugins/src/rollup/index.ts:220-223 |
| d | Nothing. The upload step runs, skips each JS file without a map and warns. | packages/bundler-plugins/src/core/debug-id-upload.ts:74-85, packages/bundler-plugins/src/core/build-plugin-manager.ts:824-831 |
| e | None exist. No default glob, because `build.sourcemap` was set. | packages/sveltekit/src/vite/sourceMaps.ts:122, packages/sveltekit/src/vite/sourceMaps.ts:143 |
| f | nothing. The plugin also warns. | packages/bundler-plugins/src/core/sourcemap-settings.ts:84-93 |

#### S4 No auth token

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. The SDK does not check the token. | packages/sveltekit/src/vite/sentryVitePlugins.ts:319, packages/sveltekit/src/vite/sourceMaps.ts:87 |
| b | `'hidden'`, as S1. | packages/sveltekit/src/vite/sourceMaps.ts:118-131, packages/sveltekit/src/vite/sourceMaps.ts:336-337 |
| c | Yes. | packages/bundler-plugins/src/rollup/index.ts:220-223 |
| d | Nothing. Warning. | packages/bundler-plugins/src/core/build-plugin-manager.ts:674-677, packages/bundler-plugins/src/core/build-plugin-manager.ts:1086-1090 |
| e | The SDK default glob still deletes the maps from disk, with no upload: `deleteArtifacts` runs in `finally`. | packages/sveltekit/src/vite/sourceMaps.ts:143-157; packages/bundler-plugins/src/rollup/index.ts:304-307 |
| f | Release creation is skipped. Release injection stays. | packages/bundler-plugins/src/core/build-plugin-manager.ts:538-542, packages/bundler-plugins/src/rollup/index.ts:132-145 |

#### S5 `sourcemaps.disable: true`

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. The SDK does not read the option. | packages/sveltekit/src/vite/sentryVitePlugins.ts:343-347, packages/sveltekit/src/vite/sourceMaps.ts:87 |
| b | `'hidden'`, as S1. | packages/sveltekit/src/vite/sourceMaps.ts:118-131, packages/sveltekit/src/vite/sourceMaps.ts:336-337 |
| c | No. | packages/bundler-plugins/src/rollup/index.ts:127, packages/bundler-plugins/src/rollup/index.ts:220 |
| d | Nothing. | packages/bundler-plugins/src/rollup/index.ts:275, packages/bundler-plugins/src/rollup/index.ts:295-298 |
| e | The SDK default glob still deletes the maps from disk. | packages/sveltekit/src/vite/sourceMaps.ts:143-157; packages/bundler-plugins/src/rollup/index.ts:304-307 |
| f | nothing. Release injection and release creation still run. | packages/bundler-plugins/src/rollup/index.ts:132-145, packages/bundler-plugins/src/rollup/index.ts:273 |

#### S6 `sourcemaps.disable: 'disable-upload'`

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | packages/sveltekit/src/vite/sourceMaps.ts:87 |
| b | `'hidden'`, as S1. | packages/sveltekit/src/vite/sourceMaps.ts:118-131, packages/sveltekit/src/vite/sourceMaps.ts:336-337 |
| c | Yes. Also stamped into the emitted chunks and maps in `generateBundle`. The SDK later rewrites the maps with `sorcery`; whether the stamped `debugId` fields stay in the maps is not confirmed (`sorcery` not read). | packages/bundler-plugins/src/rollup/index.ts:220-223, packages/bundler-plugins/src/rollup/index.ts:261-265, packages/bundler-plugins/src/rollup/index.ts:344-349; packages/sveltekit/src/vite/sourceMaps.ts:183-195 |
| d | Nothing. | packages/bundler-plugins/src/rollup/index.ts:275, packages/bundler-plugins/src/rollup/index.ts:295-298 |
| e | The SDK default glob still deletes the maps from disk. No map is left for an upload by hand, unless the user set `build.sourcemap` or an own glob. | packages/sveltekit/src/vite/sourceMaps.ts:143-157; packages/bundler-plugins/src/rollup/index.ts:304-307 |
| f | nothing. Release creation still runs. | packages/bundler-plugins/src/rollup/index.ts:273 |

#### S7 User sets `filesToDeleteAfterUpload`

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | packages/sveltekit/src/vite/sourceMaps.ts:87 |
| b | `'hidden'`, as S1. | packages/sveltekit/src/vite/sourceMaps.ts:118-131, packages/sveltekit/src/vite/sourceMaps.ts:336-337 |
| c | Yes. | packages/bundler-plugins/src/rollup/index.ts:220-223 |
| d | Read from disk by the plugin, as S1. | packages/sveltekit/src/vite/sourceMaps.ts:172-229; packages/bundler-plugins/src/core/build-plugin-manager.ts:743-790 |
| e | Only files that match the user's glob. It replaces the SDK default. Deleted from disk by the plugin after the deferred upload. | packages/sveltekit/src/vite/sourceMaps.ts:141-160; packages/bundler-plugins/src/rollup/index.ts:304-307; packages/bundler-plugins/src/core/build-plugin-manager.ts:1009-1031 |
| f | nothing | packages/sveltekit/src/vite/sentryVitePlugins.ts:320-341 |

#### S8 `deleteSourcemapsAfterUpload: true` with S2

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | packages/sveltekit/src/vite/sourceMaps.ts:87 |
| b | none. The user's value stays; the plugin does not switch `true` to `'hidden'`. | packages/sveltekit/src/vite/sourceMaps.ts:328-329; packages/bundler-plugins/src/core/sourcemap-settings.ts:135-138 |
| c | Yes. | packages/bundler-plugins/src/rollup/index.ts:220-223 |
| d | Read from disk by the plugin, as S1. | packages/sveltekit/src/vite/sourceMaps.ts:172-229; packages/bundler-plugins/src/core/build-plugin-manager.ts:743-790 |
| e | None. The SDK overwrites the option with `false`. No default glob, because the user set `build.sourcemap`. All maps stay. | packages/sveltekit/src/vite/sourceMaps.ts:80, packages/sveltekit/src/vite/sourceMaps.ts:143; packages/bundler-plugins/src/core/sourcemap-settings.ts:129-138 |
| f | nothing | packages/sveltekit/src/vite/sentryVitePlugins.ts:320-341 |

#### S9 `deleteSourcemapsAfterUpload: false`

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | packages/sveltekit/src/vite/sourceMaps.ts:87 |
| b | `'hidden'`, as S1. | packages/sveltekit/src/vite/sourceMaps.ts:118-131, packages/sveltekit/src/vite/sourceMaps.ts:336-337 |
| c | Yes. | packages/bundler-plugins/src/rollup/index.ts:220-223 |
| d | Read from disk by the plugin, as S1. | packages/sveltekit/src/vite/sourceMaps.ts:172-229; packages/bundler-plugins/src/core/build-plugin-manager.ts:743-790 |
| e | Same as S1: the SDK default glob still deletes the maps. The code that sets the glob does not read this option. | packages/sveltekit/src/vite/sourceMaps.ts:141-157; packages/bundler-plugins/src/rollup/index.ts:304-307 |
| f | nothing | packages/sveltekit/src/vite/sentryVitePlugins.ts:320-341 |

#### S10 Development mode

Detection: `process.env.NODE_ENV !== 'development'`, read when `sentrySvelteKit()` runs. The SDK has no check on the Vite command; its own source map plugins have `apply: 'build'`. What sets `NODE_ENV` for `vite dev` is in Vite (not read).

| Point | Answer | Evidence |
|---|---|---|
| a | With `NODE_ENV=development`: no Sentry Vite plugin, unless `bundleSizeOptimizations` is set (then it gets only that option). The SDK's source map plugins are build-only. | packages/sveltekit/src/vite/sentryVitePlugins.ts:310-319, packages/sveltekit/src/vite/sentryVitePlugins.ts:104-109; packages/sveltekit/src/vite/sourceMaps.ts:120, packages/sveltekit/src/vite/sourceMaps.ts:135, packages/sveltekit/src/vite/sourceMaps.ts:246 |
| b | none in the dev server. | packages/sveltekit/src/vite/sourceMaps.ts:120; packages/bundler-plugins/src/vite/source-map-hooks.ts:79-81 |
| c | No when no plugin is created. With a plugin in the dev server: not confirmed (`renderChunk` is not gated by any SDK or plugin code; whether Vite calls it in dev was not read). | packages/sveltekit/src/vite/sentryVitePlugins.ts:319; packages/bundler-plugins/src/rollup/index.ts:193-223 |
| d | Nothing. The deferred call lives in a build-only plugin, and the plugin blocks uploads when `NODE_ENV` is `development`. | packages/sveltekit/src/vite/sourceMaps.ts:246; packages/bundler-plugins/src/core/build-plugin-manager.ts:323, packages/bundler-plugins/src/core/build-plugin-manager.ts:1060-1062 |
| e | None in the dev server. In `vite build` with `NODE_ENV=development` and `bundleSizeOptimizations` set, the SDK still sets hidden maps and its default glob still deletes them. | packages/sveltekit/src/vite/sourceMaps.ts:118-157; packages/bundler-plugins/src/rollup/index.ts:304-307 |
| f | With `NODE_ENV=development`: release injection, `applicationKey`, `moduleMetadata` and release creation, because those options do not reach a plugin. The output dir injection plugin is still added. | packages/sveltekit/src/vite/sentryVitePlugins.ts:319-336, packages/sveltekit/src/vite/sentryVitePlugins.ts:88-102 |

### Mechanics

| Item | Answer | Evidence |
|---|---|---|
| Plugin entry | `sentryVitePlugin` from `@sentry/bundler-plugins/vite`, with `writeBundle` taken off the main plugin | packages/sveltekit/src/vite/sourceMaps.ts:4, packages/sveltekit/src/vite/sourceMaps.ts:87, packages/sveltekit/src/vite/sourceMaps.ts:108-111 |
| Builds | The plugins are in the user's Vite plugin list, so the injection hooks run in every build (client and server). The upload runs once for the adapter output dir. | packages/sveltekit/src/vite/sentryVitePlugins.ts:104-109, packages/sveltekit/src/vite/sourceMaps.ts:279-285, packages/sveltekit/src/vite/sourceMaps.ts:172 |
| When the upload runs | After the build and the adapter. Kit 2: `closeBundle` of the SSR build. Kit 3: post `buildApp` hook. | packages/sveltekit/src/vite/sourceMaps.ts:259-276 |
| Option mapping | Object spread of the user's options without `autoUploadSourceMaps`, `autoInstrument`, `adapter`; `sentryUrl` becomes `url`. Then the SDK overwrites `sourcemaps.filesToDeleteAfterUpload` and `sourcemaps.deleteSourcemapsAfterUpload`. | packages/sveltekit/src/vite/sentryVitePlugins.ts:320-353, packages/sveltekit/src/vite/sourceMaps.ts:70-82 |
| Development mode | `process.env.NODE_ENV !== 'development'`, plus `apply: 'build'` on the SDK's own plugins. | packages/sveltekit/src/vite/sentryVitePlugins.ts:319, packages/sveltekit/src/vite/sourceMaps.ts:120, packages/sveltekit/src/vite/sourceMaps.ts:135, packages/sveltekit/src/vite/sourceMaps.ts:246 |

## Surprises

1. SvelteKit: `sourcemaps.deleteSourcemapsAfterUpload` does nothing. The SDK forces `false` (packages/sveltekit/src/vite/sourceMaps.ts:80). `true` removes no maps (S8). `false` does not stop the SDK's default deletion glob (S9, packages/sveltekit/src/vite/sourceMaps.ts:141-157). The JSDoc says `true` also removes maps the user enabled and `false` never removes them (packages/core/src/build-time-plugins/buildTimeOptionsBase.ts:256-274).
2. Both SDKs remove SDK-enabled maps when no upload ran. SvelteKit: the default glob runs in `finally` with no auth token, with `disable: true` and with `'disable-upload'` (packages/bundler-plugins/src/rollup/index.ts:304-307, packages/sveltekit/src/vite/sourceMaps.ts:143-157). Astro at `HEAD`: the plugin drops them before write with no auth token and with `'disable-upload'` (packages/bundler-plugins/src/core/sourcemap-settings.ts:55-80); on develop the SDK glob did the same from disk. The JSDoc for `'disable-upload'` says it is for an upload by hand later (packages/core/src/build-time-plugins/buildTimeOptionsBase.ts:219-220); with an unset bundler setting no map is left in either SDK.
3. `sourcemaps.disable: true` differs between the columns. Astro: no plugin at all, so release injection, release creation, `bundleSizeOptimizations`, `applicationKey` and `moduleMetadata` are off too, and no maps are turned on (packages/astro/src/integration/index.ts:64-67). SvelteKit: the plugin stays, hidden maps are still turned on, the release is still created, and the default glob deletes the maps (packages/sveltekit/src/vite/sourceMaps.ts:121-157, packages/bundler-plugins/src/rollup/index.ts:273). The JSDoc says `true` turns off "any functionality related to source maps" (packages/core/src/build-time-plugins/buildTimeOptionsBase.ts:215).
4. SvelteKit: `autoUploadSourceMaps: false` with `bundleSizeOptimizations` set still creates the plugin and all SDK source map plugins (packages/sveltekit/src/vite/sentryVitePlugins.ts:310-316, packages/sveltekit/src/vite/sentryVitePlugins.ts:104-109). The SDK then still sets hidden maps, runs the deferred `writeBundle`, and deletes maps with the default glob. The plugin reads `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` from the environment (packages/bundler-plugins/src/core/options-mapping.ts:98-104), so the upload and release creation run when those are set. Without `bundleSizeOptimizations`, no Sentry Vite plugin exists, so `release.inject`, `applicationKey` and `moduleMetadata` do nothing.
5. `filesToDeleteAfterUpload` and `deleteSourcemapsAfterUpload` differ between the columns. Astro (`HEAD`): no default glob; the SDK defaults the delete option and the plugin removes maps before write. SvelteKit: default glob, delete option forced off, maps removed from disk after the adapter.
6. Astro, develop against `HEAD`: on develop `deleteSourcemapsAfterUpload: false` did not keep the maps (the glob was still set, HEAD~1 packages/astro/src/integration/index.ts:72-84), and the globs were fixed to `./dist`. At `HEAD` `false` keeps the maps (packages/astro/src/integration/index.ts:75) and removal follows each Vite build's output.
7. Astro (`HEAD`): `sourcemaps.resolveSourceMap` is not called for staged chunks (packages/bundler-plugins/src/rollup/source-map-handling.ts:255-258); it runs only for files read from disk (packages/bundler-plugins/src/core/build-plugin-manager.ts:789).
8. Extra keys: SvelteKit spreads the whole options object, so keys outside its type reach the plugin (`disable`, `reactComponentAnnotation`, `_experiments`). Astro passes an explicit top-level key list, so they do not (packages/sveltekit/src/vite/sentryVitePlugins.ts:320-336, packages/astro/src/integration/index.ts:87-115).
9. SvelteKit: for `auto`, `vercel` and `other` adapters the upload reads `<kit.outDir>/output`, Kit's own build output, not the adapter's output folder (packages/sveltekit/src/vite/svelteConfig.ts:92-94). The JSDoc of `adapter` lists `node`, `auto`, `vercel`; the code also handles `cloudflare` (packages/sveltekit/src/vite/types.ts:28-31, packages/sveltekit/src/vite/detectAdapter.ts:9-20).
10. SvelteKit: `build.sourcemap: false` counts as "already set", so the SDK sets no deletion glob then (packages/sveltekit/src/vite/sourceMaps.ts:122, packages/sveltekit/src/vite/sourceMaps.ts:143).
11. SvelteKit: errors thrown by the deferred `writeBundle` (release, upload, deletion) are caught and logged by the SDK (packages/sveltekit/src/vite/sourceMaps.ts:230-241). The `errorHandler` JSDoc says the plugin stops the build by default (packages/core/src/build-time-plugins/buildTimeOptionsBase.ts:87).
12. Astro: the JSDoc on `_getUpdatedSourceMapSettings` says "We won't upload anything" for `false` (packages/astro/src/integration/index.ts:392-394). The plugin is still added and its upload step runs; it finds no maps (S3).
13. Astro: `release.name` is also written into the default init snippets (packages/astro/src/integration/snippets.ts:41-43). SvelteKit sets its own default release name (packages/sveltekit/src/vite/sourceMaps.ts:364-381); Astro sets none.

## Not confirmed

- Astro: which Vite builds Astro runs (client, server, prerender), their `outDir`, and the Cloudflare and Vercel adapter folder layouts. This is in Astro and its adapters (not read). The SDK code only has the `_worker.js` rule (packages/astro/src/integration/index.ts:280) and the `{.vercel,dist}` assets glob (packages/astro/src/integration/index.ts:369-371).
- SvelteKit: that the adapter has run before `closeBundle` (Kit 2) or the post `buildApp` hook (Kit 3) calls the upload. This comes from SDK comments (packages/sveltekit/src/vite/sourceMaps.ts:258, packages/sveltekit/src/vite/sourceMaps.ts:266-267); Kit's code was not read.
- SvelteKit S6: whether `sorcery` keeps the stamped `debugId` fields in the maps.
- SvelteKit S10 c: whether Vite calls `renderChunk` in the dev server; and what sets `NODE_ENV` before the Vite config loads.
- Plugin hook order by `enforce` (SDK `config` hook before the plugin's post `config` hook) is Vite behaviour (not read). The plugin comment states the intent (packages/bundler-plugins/src/rollup/index.ts:338-339).
