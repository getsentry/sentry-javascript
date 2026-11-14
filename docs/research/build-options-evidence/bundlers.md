# Matrix C: raw `@sentry/bundler-plugins`, options by bundler

Worktree: `.claude/worktrees/remix-delete-sourcemaps`, `HEAD` = `5eab8cf562`. `git diff HEAD~1 --stat -- packages/bundler-plugins dev-packages/bundler-plugin-integration-tests` is empty, so every answer is the same on `HEAD` and on plain develop. There are no "develop:" lines.

Path prefixes in the evidence lists:

- `P/` = `packages/bundler-plugins/src/`
- `F/` = `dev-packages/bundler-plugin-integration-tests/fixtures/`

Terms:

- **Staged route**: before the bundler writes, the plugin copies each chunk and its map from memory into a temp folder, removes the map from the bundler output, and uploads the temp folder.
- **Disk route**: after the bundler writes, the plugin globs files, reads each JS file and its map from disk, writes copies with debug IDs into a temp folder, and uploads the temp folder.
- **Direct mode**: `createSentryBuildPluginManager(...)`, then `injectDebugIds(paths)`, `uploadSourcemaps(paths, { prepareArtifacts: false })`, `deleteArtifacts()`. The folders go to the CLI as they are.
- **Kind**: the bundler source map setting reduced to `unset`, `off`, `visible`, `hidden`, `inline`.
- **Upload can run**: `sourcemaps.disable` is not set, `sourcemaps.assets` is not `[]`, `NODE_ENV` is not `development`, and auth token, org (or an `sntrys_` token) and project are set (`P/core/build-plugin-manager.ts:1053-1073`).
- **removeAll**: the decision field `removeAllSourceMaps`. It is true when the plugin turned the maps on (kind `unset`) or when `sourcemaps.sdkEnabledSourceMaps` is true.

There is no Bun fixture and no fixture for watch mode, `generate()` or `write: false`. Cells for those rest on the plugin source only.

---

## Part 1: routes

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

### Evidence, Part 1

- **Entry point and option type**
  - webpack: `P/webpack/index.ts:300`, `:596-599`
  - Rollup and Rolldown: `P/rollup/index.ts:372-377`; Rolldown fixture imports `sentryRollupPlugin`: `F/rolldown/multiple-outputs-mixed-sourcemaps.config.ts:1`; package exports have no Rolldown entry: `packages/bundler-plugins/package.json:22-45`
  - Vite: `P/vite/index.ts:25-35`; shared internals `P/rollup/index.ts:93-97`
  - esbuild: `P/esbuild/index.ts:113`
  - Bun: `P/bun/index.ts:50`
  - Direct: `P/core/build-plugin-manager.ts:185-201`
- **Hooks**
  - webpack: decision `P/webpack/index.ts:445`; injection `:390-431`; stage or drop `:451-469`; stamp `:499-515`; `emit`, `done`, `failed` `:475-491`; `afterEmit` `:543-581`; `DefinePlugin` `:519-522`; loader rule `:525-541`
  - Rollup: `P/rollup/index.ts:324-334` (main), `:336-354` (post), `:327` (`transform` only when needed)
  - Vite: `P/rollup/index.ts:321-322`, `:328-330` (`configResolved` in place of `outputOptions`), `:340` (`config` on post), `P/vite/index.ts:28-32`
  - esbuild: `P/esbuild/index.ts:181-325`
  - Bun: `P/bun/index.ts:111-144`
  - Direct: `P/core/build-plugin-manager.ts:643`, `:668`, `:1009`
- **When it decides**
  - webpack: `P/webpack/index.ts:360-373`, `:445`; `SourceMapDevToolPlugin` `:156-161`
  - Rollup: `P/rollup/source-map-handling.ts:195-205`
  - Vite: `P/vite/source-map-hooks.ts:78-112` (`config`), `:114-153` (`configResolved`), `:128-141` (own setting)
  - esbuild: `P/esbuild/index.ts:310-318`
  - Bun: `P/bun/index.ts:117-120`; no call of `sourceMaps.decide` in the file
  - Direct: `P/core/build-plugin-manager.ts:973-982`
- **Setting to kind**
  - webpack: `P/webpack/index.ts:150-174`
  - Rollup, Vite: `P/rollup/source-map-handling.ts:29-40`
  - esbuild: `P/esbuild/index.ts:65-79`
- **Staged route**
  - webpack: condition `P/webpack/index.ts:453-469`; copy and removal `:257-298`; `.map.*` variants `:222-228`
  - Rollup, Vite: `P/rollup/source-map-handling.ts:209-307`; `isWrite` `:218-223`; other `.map` assets `:230-235`, `:179-192`; removal `:271-274`
  - Rollup fixture, kind unset, maps gone and upload done: `F/rollup4/sourcemaps-assets-auto.test.ts:8-30`. Rolldown: `F/rolldown/sourcemaps-assets-auto.test.ts:8-30`. Vite: `F/vite8/sourcemaps-assets-auto.test.ts:8-30`. webpack: `F/webpack5/sourcemaps-assets-auto.test.ts:8-30`
  - Direct: `P/core/build-plugin-manager.ts:712-715`, `:885-969`
- **Disk route**
  - webpack: `P/webpack/index.ts:556-560`
  - Rollup, Vite: `P/rollup/index.ts:275-294`
  - esbuild: `P/esbuild/index.ts:329-356`
  - Bun: `P/bun/index.ts:117-120`, `:148-157`
  - Shared steps: `P/core/build-plugin-manager.ts:742-848`, `P/core/debug-id-upload.ts:27-89`
  - Direct: `P/core/build-plugin-manager.ts:698-740`, `P/core/cli.ts:129-153`
  - Fixture, kind visible, maps stay, upload from disk: `F/rollup4/sourcemaps-assets.test.ts:8-33`
- **Removed without an upload**
  - webpack: `P/webpack/index.ts:453-458`, `:234-247`
  - Rollup, Vite: `P/rollup/source-map-handling.ts:237-245`, `:218-223`
  - esbuild: `P/esbuild/index.ts:337`, `:373-380`
  - Direct: `P/core/build-plugin-manager.ts:985-1003`
- **Disk glob next to the staged route**
  - webpack: `P/webpack/index.ts:560`
  - Rollup, Vite: `P/rollup/index.ts:269`, `:294`
  - Skip of staged chunks: `P/core/build-plugin-manager.ts:757-760`, `:773-775`
- **Change to hidden**
  - webpack: `P/webpack/index.ts:368-370`
  - Rollup: `P/rollup/source-map-handling.ts:199-204`
  - Vite: `P/vite/source-map-hooks.ts:91`, `:106-108`, `:125-141`
  - esbuild: `P/esbuild/index.ts:316-318`

---

## Part 2: options

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

### Evidence, Part 2

- **1. `sourcemaps.disable: true`**
  - webpack: `P/webpack/index.ts:327`, `:376`, `:418-421`, `:499`, `:556`; upload cannot run `P/core/build-plugin-manager.ts:1054-1056`; no hidden maps `P/core/sourcemap-settings.ts:55-58`
  - Rollup, Vite: `P/rollup/index.ts:127`, `:220-223`, `:275`, `:295-298`
  - esbuild: `P/esbuild/index.ts:141`, `:218`, `:338`, `:351`
  - Bun: `P/bun/index.ts:119-126`, `:148`
  - Direct: `P/core/build-plugin-manager.ts:674-677`, `:643-656` (no check), `:1009-1039` (no check)
  - Fixture config: `F/configs/debugid-disabled.config.js:3-5`
- **2. `'disable-upload'`**
  - webpack: `P/webpack/index.ts:499-515`, `:198-219`, `:556-564`
  - Rollup and Rolldown: `P/rollup/index.ts:256-266`, `P/rollup/debug-id-stamping.ts:10-32`; Rolldown placeholder `P/rollup/index.ts:221`, `:257-259`, `P/rollup/debug-id-injection.ts:28-30`, `:36-70`
  - Vite: `P/rollup/index.ts:343-349`; fixture `F/vite8/sourcemaps-disable-upload.test.ts:15-24`
  - esbuild: `P/esbuild/index.ts:338-350`, `P/core/debug-id-upload.ts:271-319`
  - Bun: `P/bun/index.ts:37-48`, `:94-107`, `:148-157`
  - Direct: `P/core/build-plugin-manager.ts:1054` (any truthy value), `:643-656`, `P/core/cli.ts:156-162`
  - No stamp without a map: `P/core/debug-id-upload.ts:239-264`. No hidden maps turned on: `P/core/sourcemap-settings.ts:55-58`
- **3. `sourcemaps.assets`**
  - Disk route (webpack, Rollup, Vite, esbuild, Bun): `P/core/build-plugin-manager.ts:743-755`, `P/core/glob.ts:3-8`; JS filter `:757-760`
  - Staged route (webpack, Rollup, Vite): `P/core/upload-filter.ts:12-32`, `P/core/build-plugin-manager.ts:916-923`
  - `[]`: `P/core/build-plugin-manager.ts:1057-1059`, `:1080-1082`; no hidden maps `P/core/sourcemap-settings.ts:55-58`
  - Direct: `P/core/build-plugin-manager.ts:700-710`, `:724-734`, `P/core/cli.ts:136-145`
  - Fixtures: `F/rollup4/sourcemaps-assets.test.ts:20-26`, `F/rollup4/sourcemaps-assets-auto.test.ts:17-23`, `F/esbuild/sourcemaps-assets-auto.test.ts:17-25`
- **4. `sourcemaps.ignore`**
  - Disk route: `P/core/build-plugin-manager.ts:753-755`
  - Staged route: `P/core/upload-filter.ts:26-31`; removal for ignored chunks `P/rollup/source-map-handling.ts:268-274`, `P/webpack/index.ts:294-296`
  - esbuild: `P/esbuild/index.ts:362-370`
  - Direct: `P/core/build-plugin-manager.ts:728-733`, `:648`, `P/core/cli.ts:17-23`, `:141`, `:156-161`
  - Fixtures: `F/rollup4/sourcemaps-ignore-auto.test.ts:8-26`, `F/esbuild/sourcemaps-ignore-auto.test.ts:8-25`
- **5. `sourcemaps.rewriteSources`**
  - Disk route: `P/core/build-plugin-manager.ts:788`, `P/core/debug-id-upload.ts:67-72`, `:138-142`; default hook `:403-409`
  - Staged route: `P/core/build-plugin-manager.ts:887`, `:925-930`
  - Not used for stamping: `P/core/debug-id-upload.ts:239-264`
  - Direct: not read in `P/core/build-plugin-manager.ts:698-740`
- **6. `sourcemaps.resolveSourceMap`**
  - Disk route: `P/core/build-plugin-manager.ts:789`, `P/core/debug-id-upload.ts:336-357`
  - Staged route does not call it: `P/rollup/source-map-handling.ts:255-266`, `P/webpack/index.ts:266-285`
  - esbuild stamping: `P/esbuild/index.ts:348`
  - Direct: not read in `P/core/build-plugin-manager.ts:698-740`
- **7. `sourcemaps.filesToDeleteAfterUpload`**
  - webpack: `P/webpack/index.ts:570-573`
  - Rollup, Vite: `P/rollup/index.ts:304-307`
  - esbuild: `P/esbuild/index.ts:381-384`
  - Bun: `P/bun/index.ts:112-115`, `:159-162`
  - Shared: `P/core/build-plugin-manager.ts:1009-1039` (no check of upload, `disable` or development mode; a Promise is awaited at `:1011`)
  - Fixture, no auth token, map deleted: `F/configs/after-upload-deletion.config.js:1-6`, `F/rollup4/after-upload-deletion.test.ts:6-13`, `F/esbuild/after-upload-deletion.test.ts:6-37`
- **9. Internal options**
  - webpack: `P/webpack/index.ts:596-599`, `:366`
  - Rollup: `P/rollup/index.ts:372`, `:364`; internals take `InternalOptions` `:93-97`
  - Vite: `P/vite/index.ts:25`; environment name `P/vite/source-map-hooks.ts:100-103`, `:119-122`
  - esbuild: `P/esbuild/index.ts:113`, `:315`
  - Bun: `P/bun/index.ts:50`
  - Direct: `P/core/build-plugin-manager.ts:186`, `:973-977`; readers `P/core/sourcemap-settings.ts:30-39`; type `P/core/types.ts:688-698`
- **10. top-level `disable`**
  - webpack: `P/webpack/index.ts:315-321`
  - Rollup, Vite: `P/rollup/index.ts:112-119`, `P/vite/index.ts:28-32`
  - esbuild: `P/esbuild/index.ts:128-135`
  - Bun: `P/bun/index.ts:65-67`
  - Direct: `P/core/build-plugin-manager.ts:227-277`
- **11a. `release.inject`**
  - webpack: `P/webpack/index.ts:331-344`, `:414-416`
  - Rollup, Vite: `P/rollup/index.ts:132-145`, `:214-216`, `P/core/index.ts:81-90`
  - esbuild: `P/esbuild/index.ts:144-157`, `:183-205`
  - Bun: `P/bun/index.ts:71-84`, `:122-130`
  - Direct: only the default is set, `P/core/options-mapping.ts:118`
- **11b. `release.create`**
  - Shared: `P/core/build-plugin-manager.ts:529-634`; guards `:530-553`; create `:565-568`
  - Callers: `P/webpack/index.ts:555`, `P/rollup/index.ts:273`, `P/esbuild/index.ts:327`, `P/bun/index.ts:146`
- **11c. `release.uploadLegacySourcemaps`**
  - `P/core/build-plugin-manager.ts:570-592`, `P/core/cli.ts:129-153`
  - Fields in the type that the code does not read (`urlSuffix`, `stripPrefix`, `stripCommonPrefix`, `sourceMapReference`, `rewrite`, `validate`): `P/core/types.ts:526-569`
- **12a. `reactComponentAnnotation`**
  - webpack: `P/webpack/index.ts:350-356`, `:525-541`
  - Rollup, Vite: `P/rollup/index.ts:151-161`, `:172-191`
  - esbuild: `P/esbuild/index.ts:163-168`
  - Bun: not read in `P/bun/index.ts`
- **12b. `bundleSizeOptimizations`**
  - webpack: `P/webpack/index.ts:519-522`
  - Rollup, Vite: `P/rollup/index.ts:163`, `:186-188`
  - esbuild: `P/esbuild/index.ts:207-215`
  - Bun: `P/bun/index.ts:132-139`
  - Direct: `P/core/build-plugin-manager.ts:423-448`
- **12c. `moduleMetadata`, `applicationKey`**
  - webpack: `P/webpack/index.ts:346-348`, `:417`
  - Rollup, Vite: `P/rollup/index.ts:147-149`, `:218`
  - esbuild: `P/esbuild/index.ts:159-161`, `:183-205`
  - Bun: `P/bun/index.ts:86-88`
  - Direct: `P/core/build-plugin-manager.ts:450-475`

### 8a. `deleteSourcemapsAfterUpload`: the decision

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

Evidence 8a: `P/core/sourcemap-settings.ts:46-151` (no upload branch `:55-81`; `off` `:84-93`; `inline` `:95-104`; `unset` `:106-127`; `hidden` `:129-133`; `visible` `:135-149`). Development mode: `P/core/build-plugin-manager.ts:974-977`. Inline map upload: `P/core/debug-id-upload.ts:124-129`, `:327-329`.

### 8b. `deleteSourcemapsAfterUpload`: how each column carries the decision out

| Point | webpack | Rollup and Rolldown | Vite | esbuild | Bun | Direct mode |
|---|---|---|---|---|---|---|
| Follows 8a | Yes. Not when `mode === 'development'`, and not when `devtool: false` with a `SourceMapDevToolPlugin`: then no change | Yes, per output | Yes for `build.sourcemap` and per-environment settings. Not for an output with its own `sourcemap` (next row) | Yes. Not when `write === false`: then no change | No. **No effect** in every row | No. **No effect** in every row unless the caller calls `sourceMaps.decide(kind)` |
| Exceptions | None | With `generate()`: only maps the plugin turned on are dropped; a `visible` to `hidden` switch stays but nothing is removed | Output with its own `sourcemap`: never switched to hidden. Removed only with `true` and (hidden, or visible with `sdkEnabledSourceMaps`). This rule does not look at `sourcemaps.disable` or at whether the upload can run. If the resolved `sourcemap` of an output is not `'hidden'` when the decision says delete, the maps stay | None | The plugin never turns maps on and never removes maps | `uploadSourcemaps` does not read the option and returns no map paths |
| When and how maps are removed | Before emit, in `processAssets` at REPORT+1. Never written | Before write, in post `generateBundle`. Never written | Same as Rollup | After the write and after the upload, from disk. Only when the upload reports success. Else an error is logged and the maps stay | Not removed | Not removed |
| What removeAll covers for kind `unset` | Maps of all assets, CSS included | Chunk maps only. `.map` assets of other plugins stay | Chunk maps only | Every `.map` file in the metafile | Not applicable | Not applicable |
| Upload fails after the maps were removed | Maps are not in the output. The temp folder is kept and its path is logged | Same | Same | Not applicable: maps are deleted only after a good upload | Not applicable | Not applicable |

Evidence 8b:

- webpack: `P/webpack/index.ts:360-373`, `:453-469`, `:257-298` (CSS at `:273-278`), `:234-247`
- Rollup and Rolldown: `P/rollup/source-map-handling.ts:195-205`, `:218-223`, `:230-245`, `:268-274`
- Vite: `P/vite/source-map-hooks.ts:86-109`, `:125-141`, `:143-151`
- esbuild: `P/esbuild/index.ts:310-318`, `:335-337`, `:358-380`; `uploadedSourceMapPaths` `P/core/build-plugin-manager.ts:791-793`, `:882`
- Bun: no use of `sourceMaps` in `P/bun/index.ts:109-165`
- Direct: `P/core/build-plugin-manager.ts:133-134`, `:698-740`, `:882`
- Upload fails: `P/core/build-plugin-manager.ts:850-856`, `:952-967`; esbuild `P/esbuild/index.ts:365-369`

---

## Part 3: development mode, watch mode, builds that write no files

| Case | webpack | Rollup and Rolldown | Vite | esbuild | Bun | Direct mode |
|---|---|---|---|---|---|---|
| `NODE_ENV=development` (the only check in the shared code) | No release, no upload, no source map decision. Debug ID snippet, release injection, metadata, bundle size flags, annotation, `disable-upload` stamping and `filesToDeleteAfterUpload` still run | Same | Same | Same | Same. The placeholder is still replaced on disk | `createRelease` and `uploadSourcemaps` return early. `decide` returns no change. `injectDebugIds` and `deleteArtifacts` still run |
| The bundler's own development mode | `mode: 'development'` stops only the source map decision. `afterEmit` still creates the release and runs the disk route, unless `NODE_ENV` is `development` | No check | `command !== 'build'` (dev server): the `config` hook returns early, so no decision and no change to `build.sourcemap`. The `transform` hook has no check. That the dev server does not call `renderChunk`, `generateBundle`, `writeBundle`: not confirmed from the plugin code | No check | No check | No check |
| Watch mode or rebuild | The decision is made once in `apply`. Each compilation has its own staging. `afterEmit` runs release, upload and `deleteArtifacts` for each compilation | `outputOptions` decides again for each build. A staging that no `writeBundle` took is thrown away when the same output is built again. Each write runs release, upload and `deleteArtifacts`. No fixture | `config` clears the stored decisions on each call. Else as Rollup. No fixture | `setup` runs once per context, so one decision. `onStart` clears the list of wrapped entries. Each `onEnd` runs release, upload and `deleteArtifacts` | Each `onEnd` runs release, upload and `deleteArtifacts` | Not applicable |
| Build that writes no files | No branch for it. The disk route reads the real file system. Behaviour with an in-memory output file system: not confirmed | `generate()` (`isWrite === false`): the plugin drops the chunk maps it turned on (kind `unset`) and returns. No staging, no upload, no release, no `filesToDeleteAfterUpload` (`writeBundle` does not run). The `disable-upload` stamp in `generateBundle` (pre) still runs | Same code as Rollup. That Vite `build.write: false` passes `isWrite === false`: not confirmed from the plugin code | `write: false`: no decision, no `disable-upload` stamp. `upload()` is still called with the metafile paths and reads the disk. Release and `filesToDeleteAfterUpload` still run | No `outdir`: no debug IDs and no upload. Release injection and creation still run. No `config` (runtime plugin): the plugin does nothing | The plugin reads no file. What the CLI does with a missing folder: not confirmed |

### Evidence, Part 3

- **`NODE_ENV=development`**: `P/core/build-plugin-manager.ts:323`, `:535-537`, `:1060-1062`, `:974-977`; no check in `injectDebugIds` `:643-656` and `deleteArtifacts` `:1009-1039`. Injection code has no check: `P/webpack/index.ts:375-433`, `P/rollup/index.ts:193-245`, `P/esbuild/index.ts:182-308`, `P/bun/index.ts:119-130`, `:148-153`
- **Own development mode**: webpack `P/webpack/index.ts:361`, `:543-581`; Vite `P/vite/source-map-hooks.ts:78-81`, `:118`, `P/rollup/index.ts:311-317`. A search of `P/` for `NODE_ENV`, `mode ===` and `command` finds only these lines plus `P/webpack/index.ts:583`
- **Watch mode**: webpack `P/webpack/index.ts:443-447`, `:549-550`; Rollup `P/rollup/source-map-handling.ts:150-159`, `:289-306`; Vite `P/vite/source-map-hooks.ts:83-84`; esbuild `P/esbuild/index.ts:219-221`, `:311-325`; Bun `P/bun/index.ts:144-163`
- **No files written**: Rollup `P/rollup/source-map-handling.ts:216-223`, `P/rollup/index.ts:256-266`; esbuild `P/esbuild/index.ts:310-315`, `:338-341`, `:351-356`, `:381-384`; Bun `P/bun/index.ts:112-120`, `:146`; disk reads `P/core/debug-id-upload.ts:37`, `P/core/glob.ts:3-8`

---

## Part 4: Surprises

### JSDoc that the code does not match

1. **webpack "array form of `devtool`"** (`P/core/types.ts:214-215`). The plugin has no code for an array. `sourceMapKindFromDevtool` treats `devtool` as a string or `false` (`P/webpack/index.ts:81`, `:150-174`). No test and no fixture uses an array; a search of `packages/bundler-plugins` and the fixtures finds only the JSDoc line. The effect that the JSDoc describes comes from webpack. I read webpack 5.112.2, the dev dependency (`node_modules/.pnpm/webpack@5.112.2_*/node_modules/webpack/lib/config/normalization.js:764-797`, outside the scope the task gave): `compiler.options.devtool` is a proxy. A read returns the `use` value of the `all` entry, else `javascript`, else `css`. A write replaces the whole array. So the write at `P/webpack/index.ts:369` replaces the array with one string each time the decision turns hidden maps on, that is, with `true` and a visible entry. Two limits: with `experiments.futureDefaults` webpack gives the plugin the raw array (same file, `:753-757`); then `devtool.includes('source-map')` is `Array.includes`, the kind is `off`, and nothing is changed or removed. And when the chosen entry is already hidden, the array stays. Whether webpack 5.105.4 (the fixture version) has the array form: not confirmed.
2. **`filesToDeleteAfterUpload`** JSDoc says the files are deleted "after the artifact upload to Sentry has been completed" (`P/core/types.ts:187`). The code deletes them after every written build: with no upload, with `sourcemaps.disable`, in development mode, and after a failed upload (`P/core/build-plugin-manager.ts:1009-1039`, `P/rollup/index.ts:304-307`; fixture `F/rollup4/after-upload-deletion.test.ts:6-13` with no auth token).
3. **`sourcemaps.disable: 'disable-upload'`** JSDoc says the emitted maps get `debug_id` "inside the bundler's build pipeline" (`P/core/types.ts:120-123`). esbuild rewrites the files on disk after the write (`P/esbuild/index.ts:342-349`). Bun: the plugin writes nothing into the map (`P/bun/index.ts:94-107`); whether Bun itself writes a debug ID into the map is not confirmed. For every bundler: when the bundler setting is unset the plugin does not turn maps on (`P/core/sourcemap-settings.ts:55-58`), and a bundle without a map gets no `//# debugId=` comment (`P/core/debug-id-upload.ts:245-248`).
4. **`sourcemaps.disable: true`** JSDoc says it "Disables all functionality related to sourcemaps" (`P/core/types.ts:118`). These still run: `release.uploadLegacySourcemaps` (`P/core/build-plugin-manager.ts:570-592`), `filesToDeleteAfterUpload` (`:1009`), map removal with `deleteSourcemapsAfterUpload: true` plus `sdkEnabledSourceMaps` (`P/core/sourcemap-settings.ts:61-80`), and `injectDebugIds` in direct mode (`P/core/build-plugin-manager.ts:643-656`).
5. **`errorHandler`** JSDoc says "By default, the plugin will simply throw an error" (`P/core/types.ts:76`). Upload and release errors are logged and the build goes on (`P/core/build-plugin-manager.ts:351-355`, `:630`, `:856`; fixture `F/rollup4/errorhandling.test.ts:5-15`). Only these throw by default: invalid options (`:364`), a failed staging write (`:947`), a failed map deletion (`:1001`), a failed `filesToDeleteAfterUpload` glob (`:1037`).
6. **`sourcemaps.assets`** JSDoc says "A glob or an array of globs" (`P/core/types.ts:133`). In direct mode the entries go to the CLI as folders (`P/core/build-plugin-manager.ts:702-706`, `:728-730`). What the CLI does with a glob or a single file there: not confirmed (the CLI is in the `sentry` package).
7. **`sourcemaps.ignore`** JSDoc says `@default []` (`P/core/types.ts:151`). `injectDebugIds` uses `node_modules` when the option is not set (`P/core/cli.ts:158`).
8. **`reactComponentAnnotation`** JSDoc names only esbuild as not supported (`P/core/types.ts:404`). Bun does not support it either and logs no warning (`P/bun/index.ts` never reads it).
9. **`deleteSourcemapsAfterUpload`** JSDoc lists Rollup, Vite, webpack and esbuild (`P/core/types.ts:217-218`). It does not say that the option does nothing in Bun.
10. **esbuild code comment** "A map the plugin turned on never stays in the output" (`P/esbuild/index.ts:360`). When the upload does not report success, the maps stay and an error is logged (`:365-369`).

### Options that do nothing

- `IncludeEntry.urlSuffix`, `stripPrefix`, `stripCommonPrefix`, `sourceMapReference`, `rewrite`, `validate`: in the type (`P/core/types.ts:526-569`), not read (`P/core/build-plugin-manager.ts:571-589`).
- `release.vcsRemote`: only given a default (`P/core/options-mapping.ts:121`); no other read in `P/`.
- `release.setCommits.ignoreMissing` and `ignoreEmpty`: not sent to the CLI (`P/core/cli.ts:82-99`).
- `sourcemaps.deleteSourcemapsAfterUpload` and `sdkEnabledSourceMaps` in Bun.
- `reactComponentAnnotation` in esbuild and Bun.
- In direct mode: `sourcemaps.rewriteSources`, `sourcemaps.resolveSourceMap`, `release.inject`, `reactComponentAnnotation`, and `deleteSourcemapsAfterUpload` (unless the caller calls `decide`).
- `sourcemaps.resolveSourceMap` for every chunk that goes through the staged route.

### Differences between bundlers for the same option

- **Bundler setting unset, default options.** webpack and esbuild remove every map, CSS maps included. Rollup, Rolldown and Vite remove chunk maps only (`P/rollup/source-map-handling.ts:231-235`). Bun turns no maps on, so it adds no debug IDs and uploads nothing, with no warning (`P/bun/index.ts:119-120`).
- **Failed upload when the decision says delete.** webpack, Rollup, Vite: the maps are already out of the output; the temp folder is kept and its path is logged. esbuild: the maps stay in the output.
- **Vite output with its own `sourcemap`.** With `deleteSourcemapsAfterUpload: true` and `'hidden'`, the maps are dropped even when `sourcemaps.disable` is set or `NODE_ENV` is `development`, with no warning (`P/vite/source-map-hooks.ts:128-141`, `P/rollup/source-map-handling.ts:237-245`). The shared decision keeps them and warns in the `sourcemaps.disable` case. With visible maps plus `sdkEnabledSourceMaps`, the maps are removed but the setting stays visible.
- **`assets: []` with `deleteSourcemapsAfterUpload: true` and visible maps.** The setting is switched to hidden and no upload runs. No map is removed, because the upload filter has no pattern and matches no file (`P/core/upload-filter.ts:18-24`, `:36-47`), unless `sdkEnabledSourceMaps` is set. This is read from the code, not run.
- **`assets` and `ignore`.** Globs for the five bundler columns. In direct mode `assets` is a folder list and `ignore` is a CLI flag.
- **`'disable-upload'` stamping.** webpack, Rollup, Vite: in memory before write. esbuild: on disk after write. Bun: only the snippet placeholder is replaced, with Bun's debug ID.
- **Development mode.** The shared code checks only `NODE_ENV`. webpack `mode: 'development'` stops the source map decision but not the release or the disk upload. Rollup, esbuild and Bun have no check, so each watch rebuild creates a release and uploads.
- **Builds that write no files.** Rollup `generate()` skips the upload (no `writeBundle`). esbuild `write: false` still calls the upload with the metafile paths and reads the disk.
- **Disk route file list.** Rollup and Vite glob the whole `output.dir`, so files that this build did not make are read too (`P/rollup/index.ts:277-287`). webpack, esbuild and Bun pass the files of the build.
- **Option types.** `sentryWebpackPlugin`, `sentryVitePlugin`, `sentryEsbuildPlugin` and `createSentryBuildPluginManager` take `InternalOptions`. `sentryRollupPlugin` and `sentryBunPlugin` take public `Options`.

### Not confirmed

- What the CLI does with a glob or a file path in direct-mode `assets`, and what `sourcemap inject` writes into the files (CLI code is in the `sentry` package).
- Whether Bun writes a debug ID into its map files (no Bun fixture; the plugin does not do it).
- That the Vite dev server calls no output hooks, and that Vite `build.write: false` gives `isWrite === false`.
- webpack with an in-memory output file system.
- The webpack array form of `devtool` in webpack 5.105.4, and in any test.
- Watch mode for every bundler: read from the code only, no fixture.
