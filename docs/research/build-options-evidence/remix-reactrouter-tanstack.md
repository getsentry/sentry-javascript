# Remix, React Router, TanStack Start

Conventions used in this report:

- All paths are relative to `packages/` in the repo, unless they start with `dev-packages/`. Example: `remix/src/vite/index.ts:42` is `packages/remix/src/vite/index.ts` line 42.
- Line numbers are at `HEAD` of the worktree for the column. A reference that starts with `HEAD~1:` gives a line number on plain develop.
- Worktrees: Remix and React Router use `remix-delete-sourcemaps`. TanStack Start uses `tanstackstart-delete-sourcemaps-c315c5`. `packages/bundler-plugins/src` and `packages/core/src/build-time-plugins` are identical in both worktrees (checked with `diff -rq`), and neither PR changes them.
- "Bundler plugin" means `sentryVitePlugin` from `@sentry/bundler-plugins/vite`.
- "Top-level" means the Vite `build.sourcemap` setting, as opposed to `environments.<name>.build.sourcemap`.

Bundler plugin facts that many cells use (same code for all three columns):

| Fact | Evidence |
| --- | --- |
| The Vite plugin decides on `build.sourcemap` in the `config` hook of its `post` plugin. It decides once for the top-level setting and once for each environment that has its own `build.sourcemap`. It does nothing when the command is not `build`. | `bundler-plugins/src/vite/source-map-hooks.ts:78-112`, `bundler-plugins/src/rollup/index.ts:336-340` |
| Function forms of `deleteSourcemapsAfterUpload` and `sdkEnabledSourceMaps` are called with `undefined` for the top-level setting and with the environment name for an environment with its own setting. | `bundler-plugins/src/core/sourcemap-settings.ts:30-39`, `bundler-plugins/src/vite/source-map-hooks.ts:88,100-103,119-122` |
| Upload not possible or `sourcemaps.disable` set: no change, unless `deleteSourcemapsAfterUpload` is `true` and the setting is `hidden` or visible. Then the maps are removed without upload, except when `disable` is set and the SDK did not turn the maps on. | `bundler-plugins/src/core/sourcemap-settings.ts:55-81` |
| Upload possible: `unset` gives hidden maps plus removal of all maps (kept with `false`). `hidden` and visible give no change unless the delete option is `true`. `removeAllSourceMaps` equals `sdkEnabledSourceMaps` for `hidden` and visible. | `bundler-plugins/src/core/sourcemap-settings.ts:83-150` |
| Staged route: `generateBundle` (order `post`) copies each chunk and map to a temp folder and deletes the map from the bundle. With `removeAllSourceMaps` and a setting other than `unset` it also drops asset maps (for example CSS maps). With no possible upload it only drops the maps. | `bundler-plugins/src/rollup/source-map-handling.ts:209-274` |
| `writeBundle`: `createRelease()`, then the upload (staging plus JS files found on disk in the output folder), then `deleteArtifacts()` in a `finally` block. `deleteArtifacts()` runs the `filesToDeleteAfterUpload` globs also when no upload ran. | `bundler-plugins/src/rollup/index.ts:268-308`, `bundler-plugins/src/core/build-plugin-manager.ts:1009-1031` |
| Debug IDs are injected in `renderChunk` unless `sourcemaps.disable === true`. With `'disable-upload'` the plugin also stamps the `//# debugId` comment and the `debug_id` map field in `generateBundle`. | `bundler-plugins/src/rollup/index.ts:127,220-223,256-266,344-349` |
| Upload blockers: `sourcemaps.disable`, `assets: []`, `NODE_ENV === 'development'`, no auth token, no org (unless `sntrys_` token), no project. | `bundler-plugins/src/core/build-plugin-manager.ts:323,1053-1073` |
| `createRelease()` is skipped with no release name, in development mode, or with no auth token, org or project. It does not look at `sourcemaps.disable`. | `bundler-plugins/src/core/build-plugin-manager.ts:529-553` |
| The staged route does not call `resolveSourceMap`. Only the disk route does. | `bundler-plugins/src/core/build-plugin-manager.ts:782-790` (disk), `:915-930` (stage) |
| Plugin defaults: `org`, `project`, `authToken`, `url` from `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `SENTRY_URL`. `debug: false`, `silent: false`, `telemetry: true`. `release.name` from `SENTRY_RELEASE` or auto-detection, `inject`, `create`, `finalize` all `true`, `setCommits: { auto: true }` (errors ignored). | `bundler-plugins/src/core/options-mapping.ts:98-127,141-169` |

---

## Column: Remix

Scope: `sentryRemixVitePlugin` from `@sentry/remix/vite`. The option type is `BuildTimeOptionsBase & { appDirPath? }` (`remix/src/vite/types.ts:3-13`).

### Matrix A

| # | Option | Value | Note | Evidence |
| --- | --- | --- | --- | --- |
| 1 | `sourcemaps.disable` | passed through; the SDK also reads it | `true`: the SDK does not add its plugin that sets `build.sourcemap`. `'disable-upload'`: that plugin stays, and the SDK's default removal is off. Both values reach the bundler plugin unchanged. | `remix/src/vite/sourceMaps.ts:49`, `remix/src/vite/index.ts:52-54`, `remix/src/vite/sourceMaps.ts:56-58` |
| 2 | `sourcemaps.assets` | passed through | | `remix/src/vite/sourceMaps.ts:48` |
| 3 | `sourcemaps.ignore` | passed through | | `remix/src/vite/sourceMaps.ts:50` |
| 4 | `sourcemaps.filesToDeleteAfterUpload` | passed through | develop: default set by SDK. Default `[<build.outDir or 'build'>/**/*.map]`, only when the user gives none, `build.sourcemap` is unset and `disable` is not set. User value replaces default. | `remix/src/vite/sourceMaps.ts:53`; develop: `HEAD~1:remix/src/vite/sourceMaps.ts:40-77,99` |
| 5 | `sourcemaps.deleteSourcemapsAfterUpload` | default set by SDK; user value replaces default | Passed as a function. It returns the user value, else `true` when the SDK turned the maps on and `disable` is not set, else `undefined`. The SDK also passes `sdkEnabledSourceMaps` as a function. develop: dropped (in the type, not in the key list). | `remix/src/vite/sourceMaps.ts:56-59`; develop: `HEAD~1:remix/src/vite/sourceMaps.ts:93-100` |
| 6 | `sourcemaps.rewriteSources` | passed through | | `remix/src/vite/sourceMaps.ts:51` |
| 7 | `sourcemaps.resolveSourceMap` | passed through | The bundler plugin calls it on the disk route only, so not for staged chunks (S1). | `remix/src/vite/sourceMaps.ts:52`, `bundler-plugins/src/core/build-plugin-manager.ts:789,925-930` |
| 8 | `release.inject` | passed through | Part of the `release` object, which the SDK passes whole. | `remix/src/vite/sourceMaps.ts:45` |
| 9 | `release.name`, `create`, `finalize`, `dist`, `setCommits`, `deploy` | passed through | The `release` object is passed by reference. No SDK default. None dropped. | `remix/src/vite/sourceMaps.ts:28,45` |
| 10 | `org`, `project`, `authToken`, `sentryUrl` | default set by SDK (first three); `sentryUrl` passed through as `url` | Defaults: `process.env.SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`. User value replaces default. No SDK default for `sentryUrl`. | `remix/src/vite/sourceMaps.ts:37,43,44,62` |
| 11 | `bundleSizeOptimizations` | passed through | Whole object. | `remix/src/vite/sourceMaps.ts:38` |
| 12 | `applicationKey`, `moduleMetadata` | passed through | | `remix/src/vite/sourceMaps.ts:36,42` |
| 13 | `debug`, `silent`, `telemetry`, `errorHandler` | `debug`: default set by SDK (`false`). `telemetry`: default set by SDK (`true`). `silent`, `errorHandler`: passed through. | The SDK also reads `debug` for its own `console` logs. | `remix/src/vite/sourceMaps.ts:39,40,46,61,115` |
| 14 | SDK-only options | none | `appDirPath` and `buildTimeInstrumentation` do not affect source maps, release or upload. | `remix/src/vite/types.ts:3-13`, `remix/src/vite/orchestrionPlugin.ts:55-56` |
| 15 | Extra keys | no spread | Explicit key list. `sourcemaps` is rebuilt key by key, so extra keys in it are lost. `release` and `bundleSizeOptimizations` are passed by reference, so extra keys inside them reach the plugin. | `remix/src/vite/sourceMaps.ts:18-33,35-68` |

### Matrix B

#### S1 Default build

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes. The bundler plugin is added and runs in each Vite build that loads the config. | `remix/src/vite/index.ts:59`, `remix/src/vite/sourceMaps.ts:35` |
| b | The SDK sets top-level `build.sourcemap: 'hidden'`. No client or server condition. The bundler plugin turns on nothing, because it already sees `hidden`. develop: the bundler plugin's `config` hook ran before the SDK's, saw `unset` and set `hidden` itself. | `remix/src/vite/sourceMaps.ts:78-91,149`, `bundler-plugins/src/core/sourcemap-settings.ts:129-133`; develop: `HEAD~1:remix/src/vite/index.ts:51-56`, `bundler-plugins/src/core/sourcemap-settings.ts:106-127` |
| c | Yes, in `renderChunk`. | `bundler-plugins/src/rollup/index.ts:220-223` |
| d | Staged from memory in `generateBundle`, uploaded in `writeBundle` from a temp folder through the `sentry` CLI package. JS files on disk that were not staged go through the disk route in the same call. | `bundler-plugins/src/rollup/source-map-handling.ts:247-274`, `bundler-plugins/src/rollup/index.ts:275-294`, `bundler-plugins/src/core/build-plugin-manager.ts:757-760,833-841` |
| e | Plugin before write: all chunk maps and asset maps (`removeAllSourceMaps` is true). None stay. develop: the plugin removes the chunk maps before write, then the SDK glob removes the remaining `.map` files of `outDir` from disk. | `remix/src/vite/sourceMaps.ts:56-59`, `bundler-plugins/src/rollup/source-map-handling.ts:230-235,271-274`; develop: `HEAD~1:remix/src/vite/sourceMaps.ts:49-64,99` |
| f | nothing | |

#### S2 User turned source maps on

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes. | `remix/src/vite/index.ts:59` |
| b | none. The SDK keeps `true`, `'hidden'` and `'inline'`. The bundler plugin makes no change. | `remix/src/vite/sourceMaps.ts:131-139`, `bundler-plugins/src/core/sourcemap-settings.ts:129-138` |
| c | Yes. | `bundler-plugins/src/rollup/index.ts:220-223` |
| d | Read from disk by the plugin after write: glob of the output folder, prepare into a temp folder, CLI upload. Same for `true` and `'hidden'`. | `bundler-plugins/src/rollup/index.ts:277-294`, `bundler-plugins/src/core/build-plugin-manager.ts:753-790,833-841` |
| e | None removed. All maps stay. The SDK's delete function returns `undefined` because the SDK did not turn the maps on. develop: same (no default glob when `build.sourcemap` is set). | `remix/src/vite/sourceMaps.ts:56-58,86`; develop: `HEAD~1:remix/src/vite/sourceMaps.ts:49-53,75-77` |
| f | nothing | |

#### S3 User turned source maps off

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes. | `remix/src/vite/index.ts:59` |
| b | none. The SDK keeps `false` and warns. The bundler plugin warns too. | `remix/src/vite/sourceMaps.ts:117-129`, `bundler-plugins/src/core/sourcemap-settings.ts:84-93` |
| c | Yes. | `bundler-plugins/src/rollup/index.ts:127,220-223` |
| d | The upload step runs, finds no map for any chunk, uploads nothing and warns. | `bundler-plugins/src/core/debug-id-upload.ts:82`, `bundler-plugins/src/core/build-plugin-manager.ts:824-831` |
| e | Nothing to remove. develop: no default glob (`build.sourcemap` is set). | `HEAD~1:remix/src/vite/sourceMaps.ts:49-53` |
| f | nothing | |

#### S4 No auth token

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes, added and run. The upload is skipped with a warning. | `remix/src/vite/index.ts:59`, `bundler-plugins/src/core/build-plugin-manager.ts:674-677,1086-1090` |
| b | The SDK sets `build.sourcemap: 'hidden'`. It does not check the token. | `remix/src/vite/index.ts:52-54`, `remix/src/vite/sourceMaps.ts:84-90` |
| c | Yes. | `bundler-plugins/src/rollup/index.ts:220-223` |
| d | Nothing. | `bundler-plugins/src/core/build-plugin-manager.ts:1063-1065` |
| e | Plugin before write: all chunk maps and asset maps are dropped from the bundle, so none is written. develop: the plugin makes no change, the maps are written, then the SDK glob removes them from disk in the plugin's `finally` block. | `remix/src/vite/sourceMaps.ts:56-59`, `bundler-plugins/src/core/sourcemap-settings.ts:55-80`, `bundler-plugins/src/rollup/source-map-handling.ts:233-245`; develop: `HEAD~1:remix/src/vite/sourceMaps.ts:49-64`, `bundler-plugins/src/rollup/index.ts:304-306` |
| f | Release creation (the plugin needs the token). Release injection and the rest stay. | `bundler-plugins/src/core/build-plugin-manager.ts:538-542` |

#### S5 `sourcemaps.disable: true`

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes, the bundler plugin is still added. | `remix/src/vite/index.ts:56-59` |
| b | none. The SDK does not add its enable plugin. The bundler plugin makes no change. | `remix/src/vite/index.ts:52-54`, `bundler-plugins/src/core/sourcemap-settings.ts:55-57` |
| c | No. | `bundler-plugins/src/rollup/index.ts:127,220` |
| d | Nothing. | `bundler-plugins/src/rollup/index.ts:275,295-298` |
| e | Nothing removed. | `bundler-plugins/src/core/sourcemap-settings.ts:55-57` |
| f | nothing. Release injection, release creation, bundle size optimisations and module metadata still run. | `bundler-plugins/src/rollup/index.ts:132-149,163,273` |

#### S6 `sourcemaps.disable: 'disable-upload'`

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes. | `remix/src/vite/index.ts:59` |
| b | The SDK sets `build.sourcemap: 'hidden'` (the enable plugin is only left out for `true`). | `remix/src/vite/index.ts:52-54`, `remix/src/vite/sourceMaps.ts:84-90` |
| c | Yes. Snippet in `renderChunk`, plus `//# debugId` comment and `debug_id` map field in `generateBundle`. | `bundler-plugins/src/rollup/index.ts:220-223,261-265,344-349` |
| d | Nothing. | `bundler-plugins/src/rollup/index.ts:275` |
| e | None removed. The SDK's delete function returns `undefined` when `disable` is set, and the plugin makes no change. The hidden maps stay. develop: same (no default glob when `disable` is set). | `remix/src/vite/sourceMaps.ts:56-58`, `bundler-plugins/src/core/sourcemap-settings.ts:55-57`; develop: `HEAD~1:remix/src/vite/sourceMaps.ts:49-53` |
| f | nothing. Release creation still runs. | `bundler-plugins/src/rollup/index.ts:273` |

#### S7 `filesToDeleteAfterUpload` glob

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes. | `remix/src/vite/index.ts:59` |
| b | As S1. | `remix/src/vite/sourceMaps.ts:84-90` |
| c | Yes. | `bundler-plugins/src/rollup/index.ts:220-223` |
| d | As S1 (staged). | `bundler-plugins/src/rollup/source-map-handling.ts:247-274` |
| e | As S1, and the plugin also deletes the files that match the user's glob from disk after each `writeBundle`, also when no upload ran. develop: the user's glob replaces the SDK's default glob. The plugin's own `unset` decision still removes the chunk maps before write when an upload can run. | `remix/src/vite/sourceMaps.ts:53`, `bundler-plugins/src/rollup/index.ts:304-306`, `bundler-plugins/src/core/build-plugin-manager.ts:1009-1031`; develop: `HEAD~1:remix/src/vite/sourceMaps.ts:40,75-77` |
| f | nothing | |

#### S8 `deleteSourcemapsAfterUpload: true` with S2

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes. | `remix/src/vite/index.ts:59` |
| b | `true`: the bundler plugin switches `build.sourcemap` to `'hidden'`. `'hidden'`: no change. The SDK turns on nothing. | `bundler-plugins/src/core/sourcemap-settings.ts:129-149`, `bundler-plugins/src/vite/source-map-hooks.ts:91` |
| c | Yes. | `bundler-plugins/src/rollup/index.ts:220-223` |
| d | Staged from memory. | `bundler-plugins/src/rollup/source-map-handling.ts:247-274` |
| e | Plugin before write: the maps of the staged chunks. Maps of chunks that `assets` or `ignore` exclude, and asset maps, stay (`removeAllSourceMaps` is false because the SDK did not turn the maps on). develop: the option does not reach the plugin, so as S2. | `remix/src/vite/sourceMaps.ts:56-59`, `bundler-plugins/src/rollup/source-map-handling.ts:230-235,271-274`; develop: `HEAD~1:remix/src/vite/sourceMaps.ts:93-100` |
| f | nothing | |

#### S9 `deleteSourcemapsAfterUpload: false`

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes. | `remix/src/vite/index.ts:59` |
| b | The SDK sets `build.sourcemap: 'hidden'`. | `remix/src/vite/sourceMaps.ts:84-90` |
| c | Yes. | `bundler-plugins/src/rollup/index.ts:220-223` |
| d | Read from disk by the plugin after write. | `bundler-plugins/src/rollup/index.ts:277-294` |
| e | None removed. The hidden maps stay. develop: the option does not reach the plugin, so as S1 (maps removed). | `remix/src/vite/sourceMaps.ts:56-58`, `bundler-plugins/src/core/sourcemap-settings.ts:129-131`; develop: `HEAD~1:remix/src/vite/sourceMaps.ts:93-100` |
| f | nothing | |

#### S10 Development mode

Detection: `process.env.NODE_ENV === 'development'` at the time `sentryRemixVitePlugin()` is called (`remix/src/vite/index.ts:42-44`).

| Point | Answer | Evidence |
| --- | --- | --- |
| a | No. Only the route manifest and orchestrion plugins are returned. | `remix/src/vite/index.ts:39-44` |
| b | none. The enable plugin also has `apply: 'build'`. | `remix/src/vite/index.ts:42-44`, `remix/src/vite/sourceMaps.ts:80` |
| c | No. | `remix/src/vite/index.ts:42-44` |
| d | Nothing. | `remix/src/vite/index.ts:42-44` |
| e | Nothing. | `remix/src/vite/index.ts:42-44` |
| f | Everything the bundler plugin does: release injection, release creation, bundle size optimisations, module metadata and application key. | `remix/src/vite/index.ts:42-44` |

### Mechanics

| Item | Answer | Evidence |
| --- | --- | --- |
| Plugin entry | `sentryVitePlugin` from `@sentry/bundler-plugins/vite`. | `remix/src/vite/sourceMaps.ts:1,35` |
| Builds or environments | No client or server condition in the SDK. The plugin runs in each Vite build that loads the config. That Remix runs one client and one SSR build with their own `outDir`: not confirmed from code (stated in the comment at `HEAD~1:remix/src/vite/sourceMaps.ts:54-56`; the E2E app checks `build/client` and `build/server`). | `remix/src/vite/index.ts:38-62`, `dev-packages/e2e-tests/test-applications/remix-sourcemaps/assert-build.ts:6-8` |
| When the upload runs | In the bundler plugin's `writeBundle` hook, once for each build. | `bundler-plugins/src/rollup/index.ts:268-308` |
| Option mapping | Explicit key list. | `remix/src/vite/sourceMaps.ts:18-33,35-68` |
| Development mode | `process.env.NODE_ENV === 'development'` when the plugin function is called. | `remix/src/vite/index.ts:42` |
| Plugin order | The SDK's enable plugin (`enforce: 'post'`) comes before the bundler plugin, so the bundler plugin decides on the setting the SDK made. develop: the bundler plugin came first. | `remix/src/vite/index.ts:52-59`; develop: `HEAD~1:remix/src/vite/index.ts:51-56` |
| CLI script `sentry-upload-sourcemaps` | Uses the `sentry` CLI package. Flags: `--release`, `--org`, `--project`, `--url`, `--urlPrefix` (default `~/build/`), `--buildPath` (default `public/build`), `--disableDebugIds` (default `false`), `--deleteAfterUpload` (default `true`), `--upload-sourcemaps`. Steps: `sourcemap.inject` on `buildPath` unless `--disableDebugIds`; release name from `--release` or `release propose-version`; `release.create`; `sourcemap.upload` of `buildPath` with `urlPrefix` and `noRewrite: disableDebugIds`; `release.finalize`; then it deletes every `.map` file under `buildPath`, recursively, when `deleteAfterUpload` is true. An upload error is caught, so the deletion also runs after a failed upload. | `remix/scripts/sentry-upload-sourcemaps.js:7-8,10-53,85-89`, `remix/scripts/injectDebugId.js:4-6`, `remix/scripts/createRelease.js:15-61`, `remix/scripts/deleteSourcemaps.js:43-54`, `remix/package.json:9-12` |
| CLI script `sentry-remix-v3-upload-sourcemaps` | Uses the `sentry` CLI package. Flags: `--entry` (required, repeatable), `--assets-module` (default `./app/assets.ts`), `--assets-export` (default `assets`), `--release`, `--org`, `--project`, `--url`, `--out-dir`, `--keep-output`, `--dry-run`. It emits the browser modules with `emitAssets` into `--out-dir` or a temp folder, then runs `release.create`, `sourcemap.upload` of that folder (with the module extensions as `ext`) and `release.finalize`. It deletes the emitted folder unless `--keep-output` or `--out-dir` is given. It deletes nothing from the app's build output. | `remix/scripts/sentry-remix-v3-upload-sourcemaps.mjs:23,46-47,67-85,92-95,101-113` |

---

## Column: React Router

Scope: two separate parts. The **Vite plugin** is `sentryReactRouter()`. The **build end step** is `sentryOnBuildEnd`, which the user must add as `buildEnd` in the React Router config. No SDK code registers it (`react-router/src/vite/index.ts:2`). `HEAD` equals develop for this package (the Remix PR does not touch it).

The option type is `BuildTimeOptionsBase` without `sourcemaps.resolveSourceMap`, plus `reactComponentAnnotation` (`react-router/src/vite/types.ts:9-25`).

### Matrix A

| # | Option | Value | Note | Evidence |
| --- | --- | --- | --- | --- |
| 1 | `sourcemaps.disable` | Vite plugin: forced (`true`). Build end step: turned into something else. | Build end step, `true`: no debug ID injection, no upload, no deletion. `'disable-upload'`: injection, no upload, no deletion. Neither value stops the SDK from setting `build.sourcemap: 'hidden'`. | `react-router/src/vite/makeCustomSentryVitePlugins.ts:55`, `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:89-92,101,123-125`, `react-router/src/vite/plugin.ts:29` |
| 2 | `sourcemaps.assets` | dropped | In the type. No code reads it. The upload always takes `reactRouterConfig.buildDirectory`. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:109-112`, `react-router/src/vite/makeCustomSentryVitePlugins.ts:51-59` |
| 3 | `sourcemaps.ignore` | dropped | In the type. No code reads it. | same as row 2 |
| 4 | `sourcemaps.filesToDeleteAfterUpload` | Vite plugin: forced (`undefined`). Build end step: default set by SDK; user value replaces default. | Default `[<buildDirectory>/**/*.map]`. The default does not depend on who turned the maps on. | `react-router/src/vite/makeCustomSentryVitePlugins.ts:58`, `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:128-140` |
| 5 | `sourcemaps.deleteSourcemapsAfterUpload` | dropped | In the type. Neither part reads it. | `react-router/src/vite/makeCustomSentryVitePlugins.ts:51-59`, `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:89-90,128` |
| 6 | `sourcemaps.rewriteSources` | dropped | In the type. Neither part reads it. | same as row 5 |
| 7 | `sourcemaps.resolveSourceMap` | not in type | Removed with `Omit`. | `react-router/src/vite/types.ts:9` |
| 8 | `release.inject` | passed through (Vite plugin) | Part of the `release` object. The build end step does not read it. | `react-router/src/vite/makeCustomSentryVitePlugins.ts:26,40` |
| 9 | `release.name`, `create`, `finalize`, `dist`, `setCommits`, `deploy` | passed through (Vite plugin); partly dropped (build end step) | Vite plugin: whole object, and its `createRelease()` runs in `writeBundle` even though source maps are disabled there. Build end step: reads only `release.name`. It creates a release when `name` is set and does not check `release.create`. Its upload sends `release.name` or the string `'undefined'`, and does not send `release.dist`. | `react-router/src/vite/makeCustomSentryVitePlugins.ts:40`, `bundler-plugins/src/rollup/index.ts:273`, `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:74-85,109-112` |
| 10 | `org`, `project`, `authToken`, `sentryUrl` | Vite plugin: default set by SDK (env vars) for the first three, `sentryUrl` passed through as `url`. Build end step: passed through. | Build end step: `token: authToken`, `org`, `url: sentryUrl`, with no env default in SDK code. A `project` array gives one upload client for each project. Whether the `sentry` package reads env vars itself: not confirmed (package not read). | `react-router/src/vite/makeCustomSentryVitePlugins.ts:31,37,38,45`, `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:63-71,79,104-106` |
| 11 | `bundleSizeOptimizations` | passed through (Vite plugin) | | `react-router/src/vite/makeCustomSentryVitePlugins.ts:32` |
| 12 | `applicationKey`, `moduleMetadata` | passed through (Vite plugin) | | `react-router/src/vite/makeCustomSentryVitePlugins.ts:30,36` |
| 13 | `debug`, `silent`, `telemetry`, `errorHandler` | Vite plugin: `debug` default `false`, `telemetry` default `true`, `silent` and `errorHandler` passed through. Build end step: reads `debug` only. | The build end step logs with `console` directly and catches its own errors, so `silent` and `errorHandler` do not apply to it. | `react-router/src/vite/makeCustomSentryVitePlugins.ts:33,34,41,42`, `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:49,81-84,96-99,114-117` |
| 14 | SDK-only options | none | The removed key `unstable_sentryVitePluginOptions` only gives a warning. Using `sentryOnBuildEnd` is itself opt-in: without it there is no debug ID injection, upload or deletion. | `react-router/src/vite/makeCustomSentryVitePlugins.ts:10`, `react-router/src/vite/index.ts:2` |
| 15 | Extra keys | no spread to the plugin | Vite plugin: explicit key list. The whole options object is stored on the Vite config as `sentryConfig`; the build end step spreads it, but reads a fixed key list. | `react-router/src/vite/makeCustomSentryVitePlugins.ts:12-27`, `react-router/src/vite/makeConfigInjectorPlugin.ts:16-20`, `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:41-61` |

### Matrix B

#### S1 Default build

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Vite plugin: added in a production build, with source maps forced off. Build end step: runs if the user registered it; it is the upload step. | `react-router/src/vite/plugin.ts:27-31`, `react-router/src/vite/makeCustomSentryVitePlugins.ts:55`, `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:38` |
| b | The SDK sets top-level `build.sourcemap: 'hidden'`. No client or server condition. The bundler plugin turns on nothing. | `react-router/src/vite/makeEnableSourceMapsPlugin.ts:7-19,70-71`, `bundler-plugins/src/core/sourcemap-settings.ts:55-57` |
| c | Vite plugin: no. Build end step: yes, `sentry.sourcemap.inject` on `buildDirectory` on disk after the build. | `bundler-plugins/src/rollup/index.ts:127,220`, `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:92-99` |
| d | Build end step: the `sentry` CLI package uploads the folder `buildDirectory`, once for each project. Vite plugin: nothing. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:101-113`, `bundler-plugins/src/rollup/index.ts:275` |
| e | Build end step, SDK glob: all files that match `<buildDirectory>/**/*.map` are deleted from disk after the upload. None stay. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:128-159` |
| f | nothing. The Vite plugin still does release injection, release creation, bundle size optimisations, module metadata and component annotation. | `react-router/src/vite/makeCustomSentryVitePlugins.ts:29-50` |

#### S2 User turned source maps on

| Point | Answer | Evidence |
| --- | --- | --- |
| a | As S1. | `react-router/src/vite/plugin.ts:27-31` |
| b | none. The SDK keeps `true`, `'hidden'` and `'inline'`. | `react-router/src/vite/makeEnableSourceMapsPlugin.ts:62-63` |
| c | Build end step: yes. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:92-95` |
| d | Build end step: folder upload, as S1. Same for `true` and `'hidden'`. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:101-113` |
| e | Build end step, SDK glob: all `.map` files under `buildDirectory` are deleted, also though the user turned them on. The default glob has no check of `build.sourcemap`. None stay. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:128-132` |
| f | nothing | |

#### S3 User turned source maps off

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Vite plugin added. Build end step runs, but skips injection and upload. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:92` |
| b | none. The SDK keeps `false` and warns. | `react-router/src/vite/makeEnableSourceMapsPlugin.ts:49-61` |
| c | No (both parts). | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:92`, `bundler-plugins/src/rollup/index.ts:127` |
| d | Nothing. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:92` |
| e | The default glob still runs. No maps are expected in the output. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:123-159` |
| f | nothing. The build end step still creates a release when `release.name` is set. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:74-85` |

#### S4 No auth token

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Both parts run. The build end step has no auth token check. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:63-71` |
| b | The SDK sets `build.sourcemap: 'hidden'`. | `react-router/src/vite/makeEnableSourceMapsPlugin.ts:70-71` |
| c | Build end step: yes. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:92-95` |
| d | The build end step calls the upload. An error is caught and logged. Whether the `sentry` package throws without a token, or reads `SENTRY_AUTH_TOKEN` itself: not confirmed (package not read). | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:101-117` |
| e | Build end step, SDK glob: the deletion runs after the `catch`, so the maps are deleted also when the upload failed. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:114-117,123-159` |
| f | Vite plugin: release creation is skipped (no token). | `bundler-plugins/src/core/build-plugin-manager.ts:538-542` |

#### S5 `sourcemaps.disable: true`

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Vite plugin: added, unchanged. Build end step: runs release creation only, then returns. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:74-92,123-125` |
| b | The SDK still sets `build.sourcemap: 'hidden'`. The enable plugin is added with no check of `sourcemaps.disable`. | `react-router/src/vite/plugin.ts:27-30` |
| c | No. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:89,92` |
| d | Nothing. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:92` |
| e | Nothing removed. The hidden maps that the SDK turned on stay in the build output. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:123-125` |
| f | nothing | |

#### S6 `sourcemaps.disable: 'disable-upload'`

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Vite plugin: added, unchanged. Build end step: runs. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:89-92` |
| b | The SDK sets `build.sourcemap: 'hidden'`. | `react-router/src/vite/plugin.ts:29` |
| c | Build end step: yes, `sentry.sourcemap.inject` on disk. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:92-95` |
| d | Nothing. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:90,101` |
| e | Nothing removed. The maps stay. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:123-125` |
| f | nothing | |

#### S7 `filesToDeleteAfterUpload` glob

| Point | Answer | Evidence |
| --- | --- | --- |
| a | As S1. | `react-router/src/vite/plugin.ts:27-31` |
| b | As S1. | `react-router/src/vite/makeEnableSourceMapsPlugin.ts:70-71` |
| c | As S1. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:92-95` |
| d | As S1. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:101-113` |
| e | Build end step: the user's glob replaces the default. `globFiles` then `rm` from disk. Maps that the glob does not match stay. The Vite plugin never gets the glob. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:128-131,141-159`, `react-router/src/vite/makeCustomSentryVitePlugins.ts:58` |
| f | nothing | |

#### S8 `deleteSourcemapsAfterUpload: true` with S2

| Point | Answer | Evidence |
| --- | --- | --- |
| a-d | As S2. No code reads the option. | `react-router/src/vite/makeCustomSentryVitePlugins.ts:51-59`, `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:89-90,128` |
| e | As S2: the default glob deletes all `.map` files under `buildDirectory`. `true` stays visible (the bundler plugin does not switch it to hidden, because its source map handling is disabled). | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:128-132`, `bundler-plugins/src/core/sourcemap-settings.ts:55-57` |
| f | nothing | |

#### S9 `deleteSourcemapsAfterUpload: false`

| Point | Answer | Evidence |
| --- | --- | --- |
| a-d | As S1. No code reads the option. | `react-router/src/vite/makeCustomSentryVitePlugins.ts:51-59`, `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:89-90,128` |
| e | As S1: the default glob still deletes all `.map` files under `buildDirectory`. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:128-132` |
| f | nothing | |

#### S10 Development mode

Detection, Vite plugin: `process.env.NODE_ENV !== 'development' && viteConfig.command === 'build' && viteConfig.mode !== 'development'` (`react-router/src/vite/plugin.ts:27`). Build end step: no development check.

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Vite plugin: the bundler plugin, the enable plugin and the orchestrion plugin are not added. Only the config injector, server build capture and tunnel base path plugins stay. Build end step: runs whenever React Router calls `buildEnd`, with no check of mode or `NODE_ENV`. | `react-router/src/vite/plugin.ts:23-31`, `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:38-125` |
| b | none | `react-router/src/vite/plugin.ts:27-29` |
| c | Vite plugin: no. Build end step: yes if it runs (for example a build with `--mode development`). | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:92-95` |
| d | Build end step: folder upload if it runs. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:101-113` |
| e | Build end step: default glob if it runs. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:128-159` |
| f | Everything the bundler plugin does: release injection, release creation by the plugin, bundle size optimisations, module metadata, component annotation. | `react-router/src/vite/plugin.ts:27-31` |

### Mechanics

| Item | Answer | Evidence |
| --- | --- | --- |
| Plugin entry | Vite plugin: `sentryVitePlugin` from `@sentry/bundler-plugins/vite`, with `sourcemaps.disable: true`. Build end step: the `sentry` CLI package (`createSentrySDK`) and `globFiles` from `@sentry/bundler-plugins/core`. | `react-router/src/vite/makeCustomSentryVitePlugins.ts:1,29,55`, `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:4-5` |
| Builds or environments | Vite plugin: no client or server condition; each Vite build that loads the config. Build end step: one run for the whole `buildDirectory` (client and server together). | `react-router/src/vite/plugin.ts:17-34`, `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:95,110` |
| When the upload runs | After the build, in React Router's `buildEnd` hook. The Vite plugin's `writeBundle` only runs release creation. | `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:38`, `bundler-plugins/src/rollup/index.ts:273-298` |
| Option mapping | Vite plugin: explicit key list. Build end step: reads `viteConfig.sentryConfig` (set by the config injector plugin), spreads it, then reads `authToken`, `headers`, `org`, `project`, `release`, `sentryUrl`, `sourcemaps`, `debug`. | `react-router/src/vite/makeCustomSentryVitePlugins.ts:12-27`, `react-router/src/vite/makeConfigInjectorPlugin.ts:16-20`, `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:19-26,41-61` |
| Development mode | Vite plugin: `NODE_ENV`, Vite `command` and Vite `mode`. Build end step: none. | `react-router/src/vite/plugin.ts:27` |

---

## Column: TanStack Start

Scope: `sentryTanstackStart` from `@sentry/tanstackstart-react/vite`. The option type extends `BuildTimeOptionsBase` (`tanstackstart-react/src/vite/sentryTanstackStart.ts:17`).

Environments:

- **client** and, in a build without Nitro, **ssr**: the bundler plugin runs. They follow the top-level decision, unless the environment has its own `build.sourcemap` (`bundler-plugins/src/vite/source-map-hooks.ts:118`). Whether TanStack Start gives them their own setting: not confirmed (framework code not read).
- **nitro** environment (with `nitro/vite`): the bundler plugin runs. The SDK sets `nitro.options.sourcemap = 'hidden'` in a Nitro module.
- **Nitro `ssr` service** (a server environment other than `nitro`, when a `nitro` environment exists): the bundler plugin does not run (`applyToEnvironment`), so there are no debug IDs, no upload, no removal, no release injection and no transforms from it there. Nitro bundles the service output again in the `nitro` environment, where the plugin runs. (`tanstackstart-react/src/vite/sourceMaps.ts:123-128`, `tanstackstart-react/src/vite/nitroSourceMaps.ts:35-41`)
- That `nitro/vite` copies `nitro.options.sourcemap` to `environments.ssr.build.sourcemap` and `environments.nitro.build.sourcemap`: not confirmed from Nitro code (not read). It is stated in the SDK comment at `tanstackstart-react/src/vite/nitroSourceMaps.ts:62`, modelled in `tanstackstart-react/test/vite/sourceMapScenarios.test.ts:78-89`, and the E2E app expects no maps in `.output/public` and `.output/server` (`dev-packages/e2e-tests/test-applications/tanstackstart-react-sourcemaps/assert-build.ts:132-134`). The cells for the `nitro` environment below rest on this.

### Matrix A

| # | Option | Value | Note | Evidence |
| --- | --- | --- | --- | --- |
| 1 | `sourcemaps.disable` | passed through; the SDK also reads it | `true` and `'disable-upload'` both make the SDK leave out its two enable plugins (top-level and Nitro). Both values reach the bundler plugin unchanged. | `tanstackstart-react/src/vite/sourceMaps.ts:100`, `tanstackstart-react/src/vite/sentryTanstackStart.ts:121-127` |
| 2 | `sourcemaps.assets` | passed through | | `tanstackstart-react/src/vite/sourceMaps.ts:99` |
| 3 | `sourcemaps.ignore` | passed through | | `tanstackstart-react/src/vite/sourceMaps.ts:101` |
| 4 | `sourcemaps.filesToDeleteAfterUpload` | passed through | develop: default set by SDK; user value replaces default. Default: `<outDir>/**/*.map` for each environment whose maps the SDK turned on, without the output folders of Nitro services. | `tanstackstart-react/src/vite/sourceMaps.ts:104`; develop: `HEAD~1:tanstackstart-react/src/vite/sourceMaps.ts:72-95,116,145-157` |
| 5 | `sourcemaps.deleteSourcemapsAfterUpload` | default set by SDK; user value replaces default | Passed as a function of the environment name. It returns the user value, else `true` when the SDK turned the maps of that environment on (top-level, or `nitro`), else `undefined`. `sdkEnabledSourceMaps` is passed as a function too. Unlike Remix, the default does not check `disable`; the enable plugins are not added then. develop: dropped. | `tanstackstart-react/src/vite/sourceMaps.ts:54-59,106-108`; develop: `HEAD~1:tanstackstart-react/src/vite/sourceMaps.ts:110-117` |
| 6 | `sourcemaps.rewriteSources` | default set by SDK; user value replaces default | Default `rewriteTanstackStartSource`: removes TanStack split queries and makes paths relative to the working directory. | `tanstackstart-react/src/vite/sourceMaps.ts:26-35,102` |
| 7 | `sourcemaps.resolveSourceMap` | passed through | The bundler plugin calls it on the disk route only. | `tanstackstart-react/src/vite/sourceMaps.ts:103`, `bundler-plugins/src/core/build-plugin-manager.ts:789,925-930` |
| 8 | `release.inject` | passed through | Part of the `release` object. Not applied in a Nitro `ssr` service, where the plugin does not run. | `tanstackstart-react/src/vite/sourceMaps.ts:96,125-128` |
| 9 | `release.name`, `create`, `finalize`, `dist`, `setCommits`, `deploy` | passed through | The `release` object is passed by reference. No SDK default. None dropped. | `tanstackstart-react/src/vite/sourceMaps.ts:78,96` |
| 10 | `org`, `project`, `authToken`, `sentryUrl` | default set by SDK (first three); `sentryUrl` passed through as `url` | Defaults: `process.env.SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`. User value replaces default. | `tanstackstart-react/src/vite/sourceMaps.ts:88,94,95,115` |
| 11 | `bundleSizeOptimizations` | passed through | Whole object (`?? undefined`). | `tanstackstart-react/src/vite/sourceMaps.ts:89` |
| 12 | `applicationKey`, `moduleMetadata` | passed through | | `tanstackstart-react/src/vite/sourceMaps.ts:87,93` |
| 13 | `debug`, `silent`, `telemetry`, `errorHandler` | `debug`: default set by SDK (`false`). `telemetry`: default set by SDK (`true`). `silent`, `errorHandler`: passed through. | The SDK also reads `debug` for its own `console` logs. | `tanstackstart-react/src/vite/sourceMaps.ts:90,91,97,114,175` |
| 14 | SDK-only options | none | `autoInstrumentMiddleware`, `tunnelRoute`, `reactComponentAnnotation` and `buildTimeInstrumentation` do not affect source maps, release or upload. Without an option, the SDK also sets Nitro's `experimental.sourcemapMinify = false` whenever its Nitro enable plugin is added. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:17-58`, `tanstackstart-react/src/vite/nitroSourceMaps.ts:72` |
| 15 | Extra keys | no spread | Explicit key list. `sourcemaps` and `reactComponentAnnotation` are rebuilt key by key. `release` and `bundleSizeOptimizations` are passed by reference, so extra keys inside them reach the plugin. | `tanstackstart-react/src/vite/sourceMaps.ts:68-84,86-121` |

### Matrix B

#### S1 Default build

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes. Runs in client and `nitro` (and in ssr without Nitro). Not in a Nitro `ssr` service. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:129`, `tanstackstart-react/src/vite/sourceMaps.ts:125-128` |
| b | The SDK sets top-level `build.sourcemap: 'hidden'` (client; ssr without Nitro). With Nitro the SDK sets `nitro.options.sourcemap = 'hidden'` (`nitro` environment and, through Nitro, the `ssr` service). The bundler plugin turns on nothing. develop: for the top-level setting the bundler plugin's `config` hook ran first, saw `unset` and set `hidden` itself. | `tanstackstart-react/src/vite/sourceMaps.ts:138-149,218`, `tanstackstart-react/src/vite/nitroSourceMaps.ts:74-81`; develop: `HEAD~1:tanstackstart-react/src/vite/sentryTanstackStart.ts:118,126-129` |
| c | Yes in client and `nitro` (and ssr without Nitro). No in a Nitro `ssr` service. | `bundler-plugins/src/rollup/index.ts:220-223`, `tanstackstart-react/src/vite/sourceMaps.ts:123-128` |
| d | Staged from memory in `generateBundle`, uploaded in `writeBundle` from a temp folder through the `sentry` CLI package, for client and `nitro`. Nothing is uploaded for the Nitro `ssr` service. develop: client staged; `nitro` read from disk by the plugin (its own setting is `hidden` and no delete option was passed). | `bundler-plugins/src/rollup/source-map-handling.ts:247-274`, `bundler-plugins/src/rollup/index.ts:275-294`; develop: `bundler-plugins/src/core/sourcemap-settings.ts:129-131` |
| e | Plugin before write: all chunk maps and asset maps of client and `nitro` (`removeAllSourceMaps` true for both). The maps of the Nitro `ssr` service stay in the service's output folder; the SDK's compose plugin reads them. develop: client by the plugin before write; `nitro` by the SDK glob `<nitro output dir>/**/*.map` from disk after the upload. | `tanstackstart-react/src/vite/sourceMaps.ts:54-59,106-108`, `tanstackstart-react/src/vite/nitroSourceMaps.ts:97-110`; develop: `HEAD~1:tanstackstart-react/src/vite/sourceMaps.ts:145-157`, `HEAD~1:tanstackstart-react/src/vite/nitroSourceMaps.ts:64-66` |
| f | nothing (apart from the Nitro `ssr` service, where the bundler plugin never runs) | `tanstackstart-react/src/vite/sourceMaps.ts:125-128` |

#### S2 User turned source maps on (top-level `build.sourcemap`)

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes, as S1. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:129` |
| b | Top-level: none; the SDK keeps `true`, `'hidden'` and `'inline'`. `nitro`: the SDK still sets `nitro.options.sourcemap = 'hidden'`. Only top-level `false`, a `build.rolldownOptions/rollupOptions.output.sourcemap` setting, or a source map setting in a Nitro config source stops that. | `tanstackstart-react/src/vite/sourceMaps.ts:190-198`, `tanstackstart-react/src/vite/nitroSourceMaps.ts:63-64,74-81` |
| c | Yes in client and `nitro`. | `bundler-plugins/src/rollup/index.ts:220-223` |
| d | Client (and ssr without Nitro): read from disk by the plugin after write. `nitro`: staged from memory. Same for `true` and `'hidden'`. | `bundler-plugins/src/rollup/index.ts:277-294`, `bundler-plugins/src/rollup/source-map-handling.ts:247-274` |
| e | Client (and ssr without Nitro): none removed; the maps stay. `nitro`: all maps removed by the plugin before write, because the SDK turned them on. develop: `nitro` maps removed by the SDK glob after the upload. | `tanstackstart-react/src/vite/sourceMaps.ts:54-59,106-108`, `tanstackstart-react/test/vite/sourceMapScenarios.test.ts:170-179`; develop: `HEAD~1:tanstackstart-react/src/vite/sourceMaps.ts:145-157` |
| f | nothing | |

#### S3 User turned source maps off (top-level `false`)

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:129` |
| b | none. The SDK keeps `false` and warns. The Nitro plugin does not set `nitro.options.sourcemap`. It still sets `experimental.sourcemapMinify = false`. | `tanstackstart-react/src/vite/sourceMaps.ts:178-189`, `tanstackstart-react/src/vite/nitroSourceMaps.ts:63-64,72,76-78` |
| c | Yes in client and `nitro`. | `bundler-plugins/src/rollup/index.ts:127,220-223` |
| d | The upload step runs, finds no maps, uploads nothing and warns. For `nitro` this rests on Nitro's own default setting: not confirmed. | `bundler-plugins/src/core/build-plugin-manager.ts:824-831` |
| e | Nothing to remove. | `bundler-plugins/src/core/sourcemap-settings.ts:84-93` |
| f | nothing | |

#### S4 No auth token

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes, added and run. The upload is skipped with a warning. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:129`, `bundler-plugins/src/core/build-plugin-manager.ts:1063-1065,1086-1090` |
| b | As S1: the SDK sets hidden maps top-level and for Nitro. It does not check the token. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:121-127` |
| c | Yes in client and `nitro`. | `bundler-plugins/src/rollup/index.ts:220-223` |
| d | Nothing. | `bundler-plugins/src/core/build-plugin-manager.ts:674-677` |
| e | Plugin before write: all chunk maps and asset maps of client and `nitro` are dropped from the bundle, so none is written. Nitro `ssr` service maps stay. develop: the plugin makes no change, the maps are written, then the SDK globs remove them from disk in the plugin's `finally` block. | `tanstackstart-react/src/vite/sourceMaps.ts:106-108`, `bundler-plugins/src/core/sourcemap-settings.ts:55-80`, `bundler-plugins/src/rollup/source-map-handling.ts:233-245`, `dev-packages/e2e-tests/test-applications/tanstackstart-react-sourcemaps/assert-no-upload.ts:7-14`; develop: `HEAD~1:tanstackstart-react/src/vite/sourceMaps.ts:85-94,145-157`, `bundler-plugins/src/rollup/index.ts:304-306` |
| f | Release creation (the plugin needs the token). | `bundler-plugins/src/core/build-plugin-manager.ts:538-542` |

#### S5 `sourcemaps.disable: true`

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes, the bundler plugin is still added. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:129` |
| b | none. The SDK adds neither enable plugin. The bundler plugin makes no change. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:121-127`, `bundler-plugins/src/core/sourcemap-settings.ts:55-57` |
| c | No. | `bundler-plugins/src/rollup/index.ts:127,220` |
| d | Nothing. | `bundler-plugins/src/rollup/index.ts:275,295-298` |
| e | Nothing removed. | `bundler-plugins/src/core/sourcemap-settings.ts:55-57` |
| f | nothing. Release injection, release creation, bundle size optimisations, module metadata and component annotation still run. The Nitro `sourcemapMinify` change is also not made. | `bundler-plugins/src/rollup/index.ts:132-163,273`, `tanstackstart-react/src/vite/sentryTanstackStart.ts:122-127` |

#### S6 `sourcemaps.disable: 'disable-upload'`

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:129` |
| b | none. `'disable-upload'` also makes the SDK leave out both enable plugins, and the bundler plugin makes no change. With the bundler setting unset there are no maps. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:121-127`, `bundler-plugins/src/core/sourcemap-settings.ts:55-57`, `tanstackstart-react/test/vite/sourceMapScenarios.test.ts:231-234` |
| c | Yes in client and `nitro`: snippet in `renderChunk`, plus the `//# debugId` comment in `generateBundle`. | `bundler-plugins/src/rollup/index.ts:220-223,261-265,344-349` |
| d | Nothing. | `bundler-plugins/src/rollup/index.ts:275` |
| e | Nothing removed. | `bundler-plugins/src/core/sourcemap-settings.ts:55-57` |
| f | nothing. Release creation still runs. | `bundler-plugins/src/rollup/index.ts:273` |

#### S7 `filesToDeleteAfterUpload` glob

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:129` |
| b | As S1. | `tanstackstart-react/src/vite/sourceMaps.ts:143-147` |
| c | As S1. | `bundler-plugins/src/rollup/index.ts:220-223` |
| d | As S1 (staged). | `bundler-plugins/src/rollup/source-map-handling.ts:247-274` |
| e | As S1 (the SDK's default removal through the plugin stays on), and the plugin also deletes the files that match the user's glob from disk after each `writeBundle`. develop: the user's glob replaces the SDK's default globs. The plugin's own `unset` decision still removes the client maps before write when an upload can run. The `nitro` maps are then only deleted if the user's glob matches them. | `tanstackstart-react/src/vite/sourceMaps.ts:104,106-108`, `tanstackstart-react/test/vite/sourceMapScenarios.test.ts:240-244`, `bundler-plugins/src/rollup/index.ts:304-306`; develop: `HEAD~1:tanstackstart-react/src/vite/sourceMaps.ts:73-76` |
| f | nothing | |

#### S8 `deleteSourcemapsAfterUpload: true` with S2

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:129` |
| b | Top-level `true`: the bundler plugin switches it to `'hidden'`. `'hidden'`: no change. `nitro`: hidden, set by the SDK as in S2. | `bundler-plugins/src/core/sourcemap-settings.ts:129-149`, `bundler-plugins/src/vite/source-map-hooks.ts:91` |
| c | Yes in client and `nitro`. | `bundler-plugins/src/rollup/index.ts:220-223` |
| d | Staged from memory, client and `nitro`. | `bundler-plugins/src/rollup/source-map-handling.ts:247-274` |
| e | Client (and ssr without Nitro): plugin before write removes the maps of staged chunks; maps of excluded chunks and asset maps stay (`removeAllSourceMaps` false). `nitro`: all maps removed (`removeAllSourceMaps` true). Nitro `ssr` service: the plugin does not run, the maps stay. develop: the option does not reach the plugin, so as S2. | `tanstackstart-react/src/vite/sourceMaps.ts:54-59,106-108`, `bundler-plugins/src/rollup/source-map-handling.ts:230-235,271-274`; develop: `HEAD~1:tanstackstart-react/src/vite/sourceMaps.ts:110-117` |
| f | nothing | |

#### S9 `deleteSourcemapsAfterUpload: false`

| Point | Answer | Evidence |
| --- | --- | --- |
| a | Yes. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:129` |
| b | As S1: the SDK sets hidden maps top-level and for Nitro. | `tanstackstart-react/src/vite/sourceMaps.ts:143-147`, `tanstackstart-react/src/vite/nitroSourceMaps.ts:80` |
| c | Yes in client and `nitro`. | `bundler-plugins/src/rollup/index.ts:220-223` |
| d | Read from disk by the plugin after write, client and `nitro`. | `bundler-plugins/src/rollup/index.ts:277-294` |
| e | None removed. All hidden maps stay. develop: the option does not reach the plugin, so as S1 (maps removed). | `tanstackstart-react/src/vite/sourceMaps.ts:106-107`, `bundler-plugins/src/core/sourcemap-settings.ts:129-131`, `tanstackstart-react/test/vite/sourceMapScenarios.test.ts:235-239`; develop: `HEAD~1:tanstackstart-react/src/vite/sourceMaps.ts:110-117` |
| f | nothing | |

#### S10 Development mode

Detection: `process.env.NODE_ENV === 'development'` at the time `sentryTanstackStart()` is called (`tanstackstart-react/src/vite/sentryTanstackStart.ts:107-109`).

| Point | Answer | Evidence |
| --- | --- | --- |
| a | No. Only the route pattern and tunnel plugins are returned. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:95-109` |
| b | none. The enable plugins also have `apply: 'build'`. | `tanstackstart-react/src/vite/sourceMaps.ts:141`, `tanstackstart-react/src/vite/nitroSourceMaps.ts:57` |
| c | No. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:107-109` |
| d | Nothing. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:107-109` |
| e | Nothing. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:107-109` |
| f | Everything the bundler plugin does (release injection, release creation, bundle size optimisations, module metadata, component annotation), plus the server instrumentation, orchestrion and middleware plugins. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:107-134` |

### Mechanics

| Item | Answer | Evidence |
| --- | --- | --- |
| Plugin entry | `sentryVitePlugin` from `@sentry/bundler-plugins/vite`. | `tanstackstart-react/src/vite/sourceMaps.ts:1,86` |
| Builds or environments | Each plugin gets `applyToEnvironment: environment => !isNitroService(environment)`. So: client and `nitro`, and ssr only in a build without Nitro. A Nitro service is a server environment that is not `nitro` while a `nitro` environment exists. | `tanstackstart-react/src/vite/sourceMaps.ts:125-128`, `tanstackstart-react/src/vite/nitroSourceMaps.ts:35-41` |
| When the upload runs | In the bundler plugin's `writeBundle` hook, once for each environment the plugin runs in. | `bundler-plugins/src/rollup/index.ts:268-308` |
| Option mapping | Explicit key list. | `tanstackstart-react/src/vite/sourceMaps.ts:68-84,86-121` |
| Development mode | `process.env.NODE_ENV === 'development'` when the plugin function is called. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:107` |
| Plugin order | The two enable plugins come before the bundler plugin. The Nitro enable plugin is `enforce: 'pre'` and sets the Nitro option in a Nitro module (`nitro.setup`). develop: the bundler plugin came before the top-level enable plugin. | `tanstackstart-react/src/vite/sentryTanstackStart.ts:118-129`, `tanstackstart-react/src/vite/nitroSourceMaps.ts:58-84`; develop: `HEAD~1:tanstackstart-react/src/vite/sentryTanstackStart.ts:118,126-129` |
| Nitro service maps | In the `nitro` environment a `load` hook returns the service chunk with its `.map` file from disk, so the bundler composes the maps. | `tanstackstart-react/src/vite/nitroSourceMaps.ts:92-111` |

---

## Surprises

Columns that behave differently for the same option:

1. `sourcemaps.disable: 'disable-upload'` with the bundler setting unset. Remix and React Router turn hidden maps on and keep them. TanStack Start adds no enable plugin, so there are debug IDs but no maps. (`remix/src/vite/index.ts:52-54`, `react-router/src/vite/plugin.ts:29`, `tanstackstart-react/src/vite/sentryTanstackStart.ts:121-127`)
2. `sourcemaps.disable: true`. Remix and TanStack Start turn no maps on. React Router still sets `build.sourcemap: 'hidden'`, and nothing removes those maps. The shared JSDoc says that `true` disables "any functionality related to source maps". (`react-router/src/vite/plugin.ts:27-30`, `react-router/src/vite/buildEnd/handleOnBuildEnd.ts:123-125`, `core/src/build-time-plugins/buildTimeOptionsBase.ts:215`)
3. Maps the user turned on (`true` or `'hidden'`). Remix and TanStack Start keep them unless `deleteSourcemapsAfterUpload: true`. React Router's build end step deletes all `.map` files under `buildDirectory` by default. The JSDoc in `react-router/src/vite/makeEnableSourceMapsPlugin.ts:28-29` says "keep this setting (don't do anything - like deletion - besides uploading)". (`react-router/src/vite/buildEnd/handleOnBuildEnd.ts:128-132`)
4. `deleteSourcemapsAfterUpload`. Remix and TanStack Start pass it as a function with an SDK default. React Router has it in the type but no code reads it, so `false` does not keep the maps. On develop it is dropped in all three. (`react-router/src/vite/buildEnd/handleOnBuildEnd.ts:128`, `HEAD~1:remix/src/vite/sourceMaps.ts:93-100`, `HEAD~1:tanstackstart-react/src/vite/sourceMaps.ts:110-117`)
5. `rewriteSources` default. TanStack Start sets its own default hook. Remix uses the plugin default. React Router drops the option. (`tanstackstart-react/src/vite/sourceMaps.ts:102`)

Options that do nothing:

6. React Router: `sourcemaps.assets`, `sourcemaps.ignore`, `sourcemaps.rewriteSources` and `sourcemaps.deleteSourcemapsAfterUpload` are in the type, and no code reads them. `release.dist` is not sent with the upload. (`react-router/src/vite/buildEnd/handleOnBuildEnd.ts:109-112`)
7. React Router: `release.create: false` does not stop the build end step from creating a release when `release.name` is set. The Vite plugin also runs its own release creation in `writeBundle`. (`react-router/src/vite/buildEnd/handleOnBuildEnd.ts:74-80`, `bundler-plugins/src/rollup/index.ts:273`)
8. All three: `resolveSourceMap` is only called on the disk route. In the default build of Remix and TanStack Start the chunks are staged, so the hook is not called for them. (`bundler-plugins/src/core/build-plugin-manager.ts:789,925-930`)

Code against comments or JSDoc:

9. React Router build end step: the comment says "Only clean up source maps that were actually uploaded", but an upload error is caught and the deletion still runs. (`react-router/src/vite/buildEnd/handleOnBuildEnd.ts:114-117,121-132`)
10. Remix CLI script `sentry-upload-sourcemaps`: same pattern. The upload error is caught, then the script deletes all `.map` files (default `--deleteAfterUpload true`). (`remix/scripts/createRelease.js:37-61`)
11. Remix and TanStack Start JSDoc for a user-enabled setting says "keep this setting (don't do anything - like deletion - besides uploading)". With `deleteSourcemapsAfterUpload: true` the bundler plugin switches `true` to `'hidden'` and removes the maps. (`remix/src/vite/sourceMaps.ts:100-101`, `tanstackstart-react/src/vite/sourceMaps.ts:158-159`, `bundler-plugins/src/core/sourcemap-settings.ts:135-149`)

Other facts:

12. TanStack Start with a top-level `build.sourcemap: true` or `'hidden'`: the SDK still turns on hidden maps for the Nitro server build and removes them. Only top-level `false`, an `output.sourcemap` setting or a Nitro config setting stops that. (`tanstackstart-react/src/vite/nitroSourceMaps.ts:63-64,74-81`, `tanstackstart-react/test/vite/sourceMapScenarios.test.ts:170-179`)
13. TanStack Start: the bundler plugin does not run in a Nitro `ssr` service. The service's maps stay on disk in the service output folder. (`tanstackstart-react/src/vite/sourceMaps.ts:123-128`)
14. TanStack Start sets Nitro's `experimental.sourcemapMinify = false` before it checks whether the user disabled source maps. (`tanstackstart-react/src/vite/nitroSourceMaps.ts:72-78`)
15. React Router build end step: no development check, and no env fallback for `authToken`, `org` or `project` in SDK code. The upload sends the release name `'undefined'` when `release.name` is not set, while the Vite plugin auto-detects a name. (`react-router/src/vite/buildEnd/handleOnBuildEnd.ts:63-71,111`, `bundler-plugins/src/core/options-mapping.ts:117`)
16. `filesToDeleteAfterUpload` (Remix, TanStack Start): the bundler plugin runs the globs in a `finally` block, also when no upload ran or `sourcemaps.disable` is set. (`bundler-plugins/src/rollup/index.ts:304-306`)
17. develop, Remix and TanStack Start: the bundler plugin's `config` hook ran before the SDK's enable plugin. With an upload possible, the bundler plugin itself turned on hidden maps and removed the chunk maps before write, and the SDK glob ran as well. (`HEAD~1:remix/src/vite/index.ts:51-56`, `HEAD~1:tanstackstart-react/src/vite/sentryTanstackStart.ts:118,126-129`)

Not confirmed cells:

- Remix: that Remix runs a separate client and SSR Vite build, each with its own `outDir` (framework code not read).
- React Router: whether the `sentry` CLI package reads `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` or `SENTRY_PROJECT` itself, and whether its upload throws without a token (package not read).
- TanStack Start: that `nitro/vite` copies `nitro.options.sourcemap` to `environments.ssr.build.sourcemap` and `environments.nitro.build.sourcemap` (Nitro code not read; the SDK comment, the unit test model and the E2E asserts say so). All `nitro` environment cells rest on this.
- TanStack Start: whether the client and ssr environments have their own `build.sourcemap` in a build without Nitro (framework code not read).
- TanStack Start S3: what Nitro's own default source map setting gives for the `nitro` environment.
