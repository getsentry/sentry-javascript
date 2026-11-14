# Nuxt, Nitro, SolidStart

Worktrees read:

- Nuxt client, Nuxt server, Nitro: `.claude/worktrees/nuxt-delete-sourcemaps-870a33` (`HEAD` = e2496570bc, `HEAD~1` = 9279303f77). The PR changes `packages/nuxt` only. `packages/nitro` and `packages/bundler-plugins` are the same on `HEAD` and `HEAD~1`.
- SolidStart 1, SolidStart 2: `.claude/worktrees/solidstart-delete-sourcemaps-211f6a` (`HEAD` = 96468c238f, `HEAD~1` = 9279303f77). The PR changes `packages/solidstart` only.

Path prefixes in the Evidence columns (all relative to the repo root):

- `NX/` = `packages/nuxt/src/`
- `NI/` = `packages/nitro/src/`
- `SS/` = `packages/solidstart/src/`
- `BP/` = `packages/bundler-plugins/src/`
- `CORE/` = `packages/core/src/build-time-plugins/`

Line numbers are at `HEAD` of the worktree. A reference that starts with `HEAD~1:` is a line number on plain develop.

Plugin rules used in many cells (same code in both worktrees):

- P-unset: bundler setting unset, upload possible: plugin turns hidden maps on, removes all of them. `BP/core/sourcemap-settings.ts:106-127`
- P-hidden / P-visible: user-enabled maps are removed only with `deleteSourcemapsAfterUpload === true`. `BP/core/sourcemap-settings.ts:129-149`
- P-noupload: no upload possible or `sourcemaps.disable` set: the plugin removes maps only when `deleteSourcemapsAfterUpload === true` and the kind is `hidden` or `visible`. With `disable` set it also needs `sdkEnabledSourceMaps`. `BP/core/sourcemap-settings.ts:55-80`
- P-off: bundler setting `false`: no change, warning. `BP/core/sourcemap-settings.ts:84-93`
- Staged route: `BP/rollup/source-map-handling.ts:247-274`. Maps removed before write: `:271-273` (chunk maps), `:230-235` (asset maps, only with `removeAllSourceMaps` and kind not `unset`), `:237-245` (no upload possible).
- Disk route: `writeBundle` globs the output folder `BP/rollup/index.ts:277-294`, then prepare and CLI upload `BP/core/build-plugin-manager.ts:742-841`.
- Direct mode: `BP/core/build-plugin-manager.ts:698-740`.
- Debug ID injection in `renderChunk`: `BP/rollup/index.ts:220-223`. It is off only for `sourcemaps.disable === true` (`:127`).
- Upload blockers: `BP/core/build-plugin-manager.ts:1053-1073`. Development mode is `NODE_ENV === 'development'` (`:323`).
- `deleteArtifacts` (runs `filesToDeleteAfterUpload`): `BP/core/build-plugin-manager.ts:1009-1031`. The Rollup and Vite plugins call it in the `finally` of `writeBundle`, also when no upload ran: `BP/rollup/index.ts:304-306`.

---

## Column: Nuxt client

The Sentry Vite plugin on the client build. "Unset" in this column means `nuxt.options.sourcemap.client` is `undefined` when the `modules:done` hook runs. Comments in the repo say Nuxt's own default is `{ server: true, client: false }` (`dev-packages/e2e-tests/test-applications/nuxt-5-sourcemaps/nuxt.config.ts:1-3`). Not confirmed from Nuxt code (it is in `node_modules`). If that default applies, a default Nuxt app follows S3 for the client, not S1.

How `nuxt.options.sourcemap.client` reaches Vite's `build.sourcemap`: not confirmed (Nuxt code). The SDK comment says it propagates (`NX/vite/sourceMaps.ts:51-54`).

### Matrix A

| # | Option | Value | Note | Evidence |
|---|---|---|---|---|
| 1 | `sourcemaps.disable` | `true`: turned into something else. `'disable-upload'`: passed through | `true`: the SDK skips the full source map setup: no source map setting change, no Vite plugin, no Nitro plugin, no deletion. `'disable-upload'`: reaches the plugin. The plugin injects and stamps debug IDs and does not upload. | `NX/vite/sourceMaps.ts:44,50,69,90,119,141`; `:191`; `BP/rollup/index.ts:261-265,275` |
| 2 | `sourcemaps.assets` | passed through | The same value goes to the client Vite plugin and to the Nitro Rollup plugin. Plugin: replaces the detected files in the disk glob and filters staged chunks. | `NX/vite/sourceMaps.ts:195`; `BP/core/build-plugin-manager.ts:744-745,918`; `BP/core/upload-filter.ts:15-31` |
| 3 | `sourcemaps.ignore` | passed through | Same value to both plugins. | `NX/vite/sourceMaps.ts:196`; `BP/core/build-plugin-manager.ts:754` |
| 4 | `sourcemaps.filesToDeleteAfterUpload` | turned into something else (plugin value forced to `undefined`) | The Vite plugin always gets `undefined`. The SDK runs the user's glob itself: at Nitro `buildStart` for files in the public dir, and at Nuxt `close` for all matches. A user value also turns the client default deletion off (row 5). develop: same (plugin value forced to `undefined`; a user glob replaces the SDK default globs). | `NX/vite/sourceMapDeletion.ts:86,88-92`; `NX/vite/sourceMaps.ts:127-135,140-144`; `NX/vite/sourceMapDeletion.ts:117-138,144-161`; `HEAD~1:NX/vite/sourceMapDeletion.ts:50` |
| 5 | `sourcemaps.deleteSourcemapsAfterUpload` | default set by SDK; user value replaces default | The SDK passes a function. It returns the user's value when set. Otherwise it returns `true` for the client environment (name `undefined` or `client`) when Sentry turned the client maps on and the user set no `filesToDeleteAfterUpload`. Otherwise `undefined`. The SDK also passes `sdkEnabledSourceMaps` (true for the client when Sentry turned the maps on). develop: **forced** `false`. | `NX/vite/sourceMapDeletion.ts:88-93,102-104`; `HEAD~1:NX/vite/sourceMapDeletion.ts:51`; `HEAD~1:NX/vite/sourceMaps.ts:91` |
| 6 | `sourcemaps.rewriteSources` | default set by SDK; user value replaces default | Default: `normalizePath`, which changes leading `../../` to `./`. | `NX/vite/sourceMaps.ts:150-152,198` |
| 7 | `sourcemaps.resolveSourceMap` | passed through | The plugin uses it on the disk route only. The staged route takes the map from the bundle. | `NX/vite/sourceMaps.ts:199`; `BP/core/build-plugin-manager.ts:789`; `BP/rollup/source-map-handling.ts:255-266` |
| 8 | `release.inject` | passed through | Through the spread of `release`. Plugin default `true`. | `NX/vite/sourceMaps.ts:178-182`; `BP/core/options-mapping.ts:118` |
| 9 | `release.name/create/finalize/dist/setCommits/deploy` | passed through | `release` is spread. No SDK defaults. None dropped. | `NX/vite/sourceMaps.ts:178-182` |
| 10 | `org`, `project`, `authToken`, `sentryUrl` | default set by SDK | Defaults: `process.env.SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `SENTRY_URL`. `sentryUrl` goes to the plugin key `url`. | `NX/vite/sourceMaps.ts:168-170,172` |
| 11 | `bundleSizeOptimizations` | passed through | To both plugins. | `NX/vite/sourceMaps.ts:177` |
| 12 | `applicationKey`, `moduleMetadata` | passed through | To both plugins. | `NX/vite/sourceMaps.ts:167,183` |
| 13 | `debug`, `silent`, `telemetry`, `errorHandler` | default set by SDK (`debug: false`, `silent: false`, `telemetry: true`); `errorHandler` passed through | `debug` also turns on the SDK's own console logs. | `NX/vite/sourceMaps.ts:171,174-176,42` |
| 14 | SDK-only options | `enabled` (default `true`) | `enabled: false` returns before all setup. The source map setup also needs a Sentry client or server config file. `unstable_sentryBundlerPluginOptions` is removed and only gives a warning. There is no `autoUploadSourceMaps`-type switch. | `NX/module.ts:27-29,106-108`; `NX/vite/sourceMaps.ts:40` |
| 15 | Extra keys | No at the top level and in `sourcemaps`. Yes in `release`. | Explicit key list. `release` is spread, so keys such as `vcsRemote` or `uploadLegacySourcemaps` reach the plugin. `headers` is in the list. | `NX/vite/sourceMaps.ts:166-201` |

### Matrix B

#### S1 Default build (client unset)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. `sentryVitePlugin` is added with `{ dev: false, build: true, server: false }`. | `NX/vite/sourceMaps.ts:69,76-86` |
| b | SDK sets `nuxt.options.sourcemap.client = 'hidden'` (client). | `NX/vite/sourceMaps.ts:57,280-284,294-297` |
| c | Yes. | `BP/rollup/index.ts:220-223` |
| d | Staged from memory, uploaded in `writeBundle`. | `BP/rollup/source-map-handling.ts:247-274`; `BP/rollup/index.ts:268-294` |
| e | The plugin removes all client maps before write (delete option `true` from the SDK function, `removeAllSourceMaps` from `sdkEnabledSourceMaps`). None stay. develop: maps are written, the plugin uploads them from disk, then the SDK glob `<publicDir>/**/*.map` deletes them at Nitro `buildStart` and at `close`. | `NX/vite/sourceMapDeletion.ts:88-93`; `BP/core/sourcemap-settings.ts:129-133`; `BP/rollup/source-map-handling.ts:230-235,271-273`; `HEAD~1:NX/vite/sourceMapDeletion.ts:23`; `HEAD~1:NX/vite/sourceMaps.ts:138,147` |
| f | nothing | |

#### S2 User turned client source maps on (`sourcemap.client: true` or `'hidden'`)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | `NX/vite/sourceMaps.ts:76-86` |
| b | none. The SDK keeps the setting. `true` and `'hidden'` are the same to the SDK. | `NX/vite/sourceMaps.ts:275-278,291-293` |
| c | Yes. | `BP/rollup/index.ts:220-223` |
| d | Read from disk by the plugin. | `BP/rollup/index.ts:277-294`; `BP/core/build-plugin-manager.ts:742-841` |
| e | None removed. `fallback.client` is false, so the delete option is `undefined`. All client maps stay (`true`: with the `sourceMappingURL` comment, `'hidden'`: without). | `NX/vite/sourceMaps.ts:60`; `NX/vite/sourceMapDeletion.ts:88-92`; `BP/core/sourcemap-settings.ts:129-138` |
| f | nothing | |

#### S3 User turned client source maps off (`sourcemap.client: false`)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. The plugin is added without a check of the setting. | `NX/vite/sourceMaps.ts:69-86` |
| b | none. SDK warns. | `NX/vite/sourceMaps.ts:288-290,381-391` |
| c | Yes. | `BP/rollup/index.ts:220-223` |
| d | Nothing. The plugin warns (P-off). The disk route skips bundles without a map. | `BP/core/sourcemap-settings.ts:84-93`; `BP/core/debug-id-upload.ts:74-85`; `BP/core/build-plugin-manager.ts:824-831` |
| e | No maps exist. | |
| f | nothing. Release injection and release creation still run. | `BP/rollup/index.ts:132-145,273` |

#### S4 No auth token (client unset)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | `NX/vite/sourceMaps.ts:76-86` |
| b | SDK still sets `sourcemap.client = 'hidden'` (no token check). | `NX/vite/sourceMaps.ts:254-314` |
| c | Yes. | `BP/rollup/index.ts:220-223` |
| d | Nothing. Blocker `no-auth-token`. | `BP/core/build-plugin-manager.ts:1063-1064` |
| e | The plugin removes all client maps before write, without an upload (P-noupload with delete option `true` and `sdkEnabledSourceMaps`). develop: maps are written, then the SDK glob deletes them without an upload. | `BP/core/sourcemap-settings.ts:55-80`; `BP/rollup/source-map-handling.ts:237-245`; `HEAD~1:NX/vite/sourceMaps.ts:138,147` |
| f | Release creation is skipped. Release injection stays. | `BP/core/build-plugin-manager.ts:538-542` |

#### S5 `sourcemaps.disable: true`

| Point | Answer | Evidence |
|---|---|---|
| a | No. No Sentry plugin is added. | `NX/vite/sourceMaps.ts:44,69` |
| b | none | `NX/vite/sourceMaps.ts:50` |
| c | No. | |
| d | Nothing. | |
| e | Nothing removed. | `NX/vite/sourceMaps.ts:141` |
| f | Release injection, release creation, bundle size optimisations, `applicationKey` and `moduleMetadata` injection are all off. The plugins are the only code that gets these options. | `NX/vite/sourceMaps.ts:159-202` |

#### S6 `sourcemaps.disable: 'disable-upload'` (client unset)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | `NX/vite/sourceMaps.ts:44,76-86` |
| b | SDK sets `sourcemap.client = 'hidden'`. | `NX/vite/sourceMaps.ts:57` |
| c | Yes. The plugin also stamps debug IDs into the emitted chunks and maps. | `BP/rollup/index.ts:220-223,261-265,344-349` |
| d | Nothing. | `BP/rollup/index.ts:275,295-297` |
| e | The plugin removes all client maps before write, without an upload. The delete option is `true` (SDK default) and `sdkEnabledSourceMaps` is true, so the "keep for manual upload" branch does not apply. develop: maps are written with debug IDs, then the SDK glob deletes them. | `NX/vite/sourceMapDeletion.ts:88-93`; `BP/core/sourcemap-settings.ts:61-80`; `BP/rollup/source-map-handling.ts:237-245`; `HEAD~1:NX/vite/sourceMaps.ts:138,147` |
| f | nothing. Release creation still runs. | `BP/rollup/index.ts:273` |

#### S7 User sets `sourcemaps.filesToDeleteAfterUpload` (client unset)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | `NX/vite/sourceMaps.ts:76-86` |
| b | SDK sets `sourcemap.client = 'hidden'`. | `NX/vite/sourceMaps.ts:57` |
| c | Yes. | `BP/rollup/index.ts:220-223` |
| d | Read from disk by the plugin. The user glob makes the delete option `undefined`, so nothing is staged. | `NX/vite/sourceMapDeletion.ts:88-92`; `BP/core/sourcemap-settings.ts:129-131`; `BP/rollup/index.ts:277-294` |
| e | The plugin removes nothing (its `filesToDeleteAfterUpload` is `undefined`). The SDK runs the user's glob: files in the public dir at Nitro `buildStart`, all matches at `close`. Sentry-enabled maps that the glob does not match stay. | `NX/vite/sourceMapDeletion.ts:86,117-138,144-161`; `NX/vite/sourceMaps.ts:127-135,140-144,231-235` |
| f | nothing | |

#### S8 `deleteSourcemapsAfterUpload: true` with S2

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | `NX/vite/sourceMaps.ts:76-86` |
| b | `true` (visible): the plugin switches Vite's `build.sourcemap` to `'hidden'`. `'hidden'`: no change. | `BP/core/sourcemap-settings.ts:135-149`; `BP/vite/source-map-hooks.ts:91` |
| c | Yes. | `BP/rollup/index.ts:220-223` |
| d | Staged from memory. | `BP/rollup/source-map-handling.ts:247-274` |
| e | The plugin removes the maps of the staged (uploaded) chunks before write. `removeAllSourceMaps` is false, so maps of chunks that `assets`/`ignore` exclude, and asset maps (CSS), stay. develop: the option is forced to `false`; maps are uploaded from disk and stay. | `NX/vite/sourceMapDeletion.ts:88-93`; `BP/rollup/source-map-handling.ts:268-274`; `HEAD~1:NX/vite/sourceMapDeletion.ts:51` |
| f | nothing | |

#### S9 `deleteSourcemapsAfterUpload: false` (client unset)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | `NX/vite/sourceMaps.ts:76-86` |
| b | SDK sets `sourcemap.client = 'hidden'`. | `NX/vite/sourceMaps.ts:57` |
| c | Yes. | `BP/rollup/index.ts:220-223` |
| d | Read from disk by the plugin. | `BP/core/sourcemap-settings.ts:129-131`; `BP/rollup/index.ts:277-294` |
| e | None removed. With the Vite builder there is no client glob. The Sentry-enabled hidden client maps stay in the output. develop: the option is not read (forced `false`); the SDK glob still deletes the client maps. | `NX/vite/sourceMapDeletion.ts:27,88-92`; `NX/vite/sourceMaps.ts:122-124`; `HEAD~1:NX/vite/sourceMapDeletion.ts:23,51` |
| f | nothing | |

#### S10 Development mode

| Point | Answer | Evidence |
|---|---|---|
| a | No. Detection: `nuxt.options.dev` or `nuxt.options._prepare`. The plugin is also added with `dev: false`. The plugin has its own checks: `NODE_ENV === 'development'` and Vite `command !== 'build'`. | `NX/vite/sourceMaps.ts:50,69,72-73,85`; `BP/core/build-plugin-manager.ts:323`; `BP/vite/source-map-hooks.ts:79` |
| b | none | `NX/vite/sourceMaps.ts:50` |
| c | No. | |
| d | Nothing. | |
| e | Nothing. | `NX/vite/sourceMaps.ts:141` |
| f | Release injection, bundle size optimisations and metadata injection are not applied in dev (no plugin). | `NX/vite/sourceMaps.ts:69` |

#### Other builders and the Nuxt 5 environment API

| Topic | Answer | Evidence |
|---|---|---|
| webpack or rspack builder | `packages/nuxt/src` imports only the Vite plugin, the Rollup plugin and the plugin core. There is no Sentry webpack plugin. `addVitePlugin` is still called; what `@nuxt/kit` does with it for another builder: not confirmed. The SDK still sets `sourcemap.client = 'hidden'` when unset. It then adds the public dir to the fallback, so the SDK glob `<publicDir>/**/*.map` deletes the client maps at Nitro `buildStart` and at `close`. No SDK code uploads client maps or injects debug IDs for such a build. `deleteSourcemapsAfterUpload` has no effect on that glob. | `NX/vite/sourceMaps.ts:2-3,57,122-124`; `NX/vite/sourceMapDeletion.ts:1-6,27,33-48` |
| Vite environment API (Nuxt 5) | The SDK functions answer for the client only: environment name `undefined` or `client`. The plugin passes a name only for an environment that sets its own `build.sourcemap`. An environment without its own setting gets the top-level decision, which is the client answer. A user value of `deleteSourcemapsAfterUpload` is returned for all environments. Whether `{ server: false }` keeps the plugin out of the server environments, and whether Nuxt 5 gives them their own `build.sourcemap`: not confirmed (Nuxt code). | `NX/vite/sourceMapDeletion.ts:88-93,102-104`; `BP/vite/source-map-hooks.ts:93-104,114-122` |

### Mechanics

| Item | Answer | Evidence |
|---|---|---|
| Plugin entry | `sentryVitePlugin` from `@sentry/bundler-plugins/vite` | `NX/vite/sourceMaps.ts:3,76-83` |
| Builds | The Vite client build (`server: false`). The SSR build gets only the validation plugin. Not the webpack or rspack builder. | `NX/vite/sourceMaps.ts:70-86` |
| When the upload runs | In the plugin's `writeBundle` hook of the client build. | `BP/rollup/index.ts:268-294` |
| Option mapping | Explicit key list in `getPluginOptions`, with `release` spread. Then `withClientSourceMapDeletion` overrides `filesToDeleteAfterUpload`, `deleteSourcemapsAfterUpload` and adds `sdkEnabledSourceMaps`. | `NX/vite/sourceMaps.ts:159-202`; `NX/vite/sourceMapDeletion.ts:75-96` |
| Development mode | `nuxt.options.dev`, `nuxt.options._prepare`, `addVitePlugin` option `dev: false`. | `NX/vite/sourceMaps.ts:50,69,72,85` |

---

## Column: Nuxt server

The Sentry Rollup plugin inside Nitro, and the SDK's own deletion after the build. "Unset" means `nuxt.options.sourcemap.server` is `undefined` at `modules:done` and `nitro.rollupConfig.output.sourcemap` is `undefined`. Repo comments say Nuxt's own default is `server: true` (not confirmed from Nuxt code). If so, a default Nuxt app follows S2 for the server.

What Nitro passes to Rollup as `output.sourcemap` for each Nuxt setting: not confirmed (Nitro code). The cells below give the plugin rule for each value it can get.

### Matrix A

| # | Option | Value | Note | Evidence |
|---|---|---|---|---|
| 1 | `sourcemaps.disable` | `true`: turned into something else. `'disable-upload'`: passed through | `true`: no Rollup plugin, no setting change, no deletion, and `sourcemapExcludeSources` / `sourcemapMinify` are not changed. `'disable-upload'`: reaches the plugin; the SDK deletion still runs (S6). | `NX/vite/sourceMaps.ts:44,90,119,141,191` |
| 2 | `sourcemaps.assets` | passed through | Same value as the client plugin gets. | `NX/vite/sourceMaps.ts:195` |
| 3 | `sourcemaps.ignore` | passed through | | `NX/vite/sourceMaps.ts:196` |
| 4 | `sourcemaps.filesToDeleteAfterUpload` | turned into something else; default set by SDK; user value replaces default | The Rollup plugin always gets `undefined`. The SDK runs the globs itself with `deleteArtifacts` at Nuxt `close`, and deletes matches in the public dir at Nitro `buildStart`. Default when the user gives none: `<serverDir>/**/*.map` if Sentry turned the server maps on, plus public dir globs if Sentry turned the client maps on and the builder is not Vite. | `NX/vite/sourceMapDeletion.ts:20-30,111,117-138,144-161`; `NX/vite/sourceMaps.ts:140-144,212-236` |
| 5 | `sourcemaps.deleteSourcemapsAfterUpload` | forced `false` | `getPluginOptions` does not read it. `withoutSourceMapDeletion` sets `false` on the Rollup plugin. The SDK glob of row 4 does not read it. | `NX/vite/sourceMaps.ts:190-200`; `NX/vite/sourceMapDeletion.ts:106-115` |
| 6 | `sourcemaps.rewriteSources` | default set by SDK; user value replaces default | Default `normalizePath`. | `NX/vite/sourceMaps.ts:150-152,198` |
| 7 | `sourcemaps.resolveSourceMap` | passed through | Used: the server upload is always the disk route. | `NX/vite/sourceMaps.ts:199`; `BP/core/build-plugin-manager.ts:789` |
| 8 | `release.inject` | passed through | | `NX/vite/sourceMaps.ts:178-182` |
| 9 | `release.*` | passed through | Same object as the client plugin, so `createRelease` runs in both plugins. | `NX/vite/sourceMaps.ts:178-182`; `BP/rollup/index.ts:273` |
| 10 | `org`, `project`, `authToken`, `sentryUrl` | default set by SDK | Env vars, as in the client column. | `NX/vite/sourceMaps.ts:168-170,172` |
| 11 | `bundleSizeOptimizations` | passed through | | `NX/vite/sourceMaps.ts:177` |
| 12 | `applicationKey`, `moduleMetadata` | passed through | | `NX/vite/sourceMaps.ts:167,183` |
| 13 | `debug`, `silent`, `telemetry`, `errorHandler` | default set by SDK (`false`, `false`, `true`); `errorHandler` passed through | | `NX/vite/sourceMaps.ts:171,174-176` |
| 14 | SDK-only options | `enabled` (default `true`) | As in the client column. The SDK also forces `nitro.rollupConfig.output.sourcemapExcludeSources = false` and `nitro.experimental.sourcemapMinify = false` when the setup runs. `nitro.rollupConfig.output.sourcemap` set by the user turns the server default glob off. | `NX/module.ts:27-29`; `NX/vite/sourceMaps.ts:103,356-359` |
| 15 | Extra keys | No at the top level and in `sourcemaps`. Yes in `release`. | | `NX/vite/sourceMaps.ts:166-201` |

### Matrix B

#### S1 Default build (server unset)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. `sentryRollupPlugin` is pushed to `nitroConfig.rollupConfig.plugins` in the `nitro:config` hook. | `NX/vite/sourceMaps.ts:89-115` |
| b | SDK sets `nuxt.options.sourcemap.server = 'hidden'` (server). If Rollup's `output.sourcemap` still arrives unset, the plugin turns hidden maps on itself and keeps them (delete option `false`). | `NX/vite/sourceMaps.ts:280-284,306-309`; `BP/core/sourcemap-settings.ts:106-116` |
| c | Yes. | `BP/rollup/index.ts:220-223` |
| d | Read from disk by the plugin in `writeBundle` of the Nitro build. No staging, because the delete option is forced to `false`. | `NX/vite/sourceMapDeletion.ts:112`; `BP/rollup/source-map-handling.ts:226-228`; `BP/rollup/index.ts:277-294` |
| e | The plugin removes none. The SDK glob `<serverDir>/**/*.map` deletes every `.map` file under the server dir at Nuxt `close`. | `NX/vite/sourceMapDeletion.ts:28,117-138`; `NX/vite/sourceMaps.ts:61,103,121,140-144` |
| f | nothing | |

#### S2 User turned server source maps on (`sourcemap.server: true` or `'hidden'`)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | `NX/vite/sourceMaps.ts:89-115` |
| b | none. `true` and `'hidden'` are the same to the SDK. The SDK still sets `sourcemapExcludeSources: false` and `sourcemapMinify: false`. | `NX/vite/sourceMaps.ts:275-278,303-305,356-359` |
| c | Yes. | `BP/rollup/index.ts:220-223` |
| d | Read from disk by the plugin. | `BP/rollup/index.ts:277-294` |
| e | None removed. `fallback.server` is false, so there is no glob. All server maps stay. | `NX/vite/sourceMaps.ts:61`; `NX/vite/sourceMapDeletion.ts:28` |
| f | nothing | |

#### S3 User turned server source maps off (`sourcemap.server: false`)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. The plugin is added without a check of the setting. | `NX/vite/sourceMaps.ts:89-115` |
| b | SDK: none, with a warning. Plugin: if Rollup gets `sourcemap: false`, no change (P-off). If Rollup gets no setting, the plugin turns hidden maps on and keeps them. Which one Nitro passes: not confirmed. | `NX/vite/sourceMaps.ts:300-302`; `BP/core/sourcemap-settings.ts:84-93,106-116` |
| c | Yes. | `BP/rollup/index.ts:220-223` |
| d | Nothing when no maps exist (the disk route skips bundles without a map). | `BP/core/debug-id-upload.ts:74-85` |
| e | None. `fallback.server` is false (`'disabled'`). | `NX/vite/sourceMaps.ts:61` |
| f | nothing | |

#### S4 No auth token (server unset)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | `NX/vite/sourceMaps.ts:89-115` |
| b | SDK still sets `sourcemap.server = 'hidden'`. | `NX/vite/sourceMaps.ts:254-314` |
| c | Yes. | `BP/rollup/index.ts:220-223` |
| d | Nothing. | `BP/core/build-plugin-manager.ts:1063-1064` |
| e | The SDK glob still deletes `<serverDir>/**/*.map` at `close`, without an upload. `deleteSourceMapsAfterBuild` has no token check. | `NX/vite/sourceMapDeletion.ts:117-138` |
| f | Release creation is skipped. | `BP/core/build-plugin-manager.ts:538-542` |

#### S5 `sourcemaps.disable: true`

| Point | Answer | Evidence |
|---|---|---|
| a | No. | `NX/vite/sourceMaps.ts:44,90` |
| b | none. `sourcemapExcludeSources` and `sourcemapMinify` are also left as they are. | `NX/vite/sourceMaps.ts:50,90,100` |
| c | No. | |
| d | Nothing. | |
| e | Nothing. | `NX/vite/sourceMaps.ts:119,141` |
| f | Release injection, release creation, bundle size optimisations and metadata injection for the server are off. | `NX/vite/sourceMaps.ts:90-115` |

#### S6 `sourcemaps.disable: 'disable-upload'` (server unset)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | `NX/vite/sourceMaps.ts:44,89-115` |
| b | SDK sets `sourcemap.server = 'hidden'`. | `NX/vite/sourceMaps.ts:57` |
| c | Yes, and stamped into the emitted chunks and maps. | `BP/rollup/index.ts:220-223,261-265` |
| d | Nothing. | `BP/rollup/index.ts:275` |
| e | The SDK glob deletes `<serverDir>/**/*.map` at `close`. The stamped maps do not stay for a manual upload. | `NX/vite/sourceMapDeletion.ts:28,117-138`; `NX/vite/sourceMaps.ts:140-144` |
| f | nothing | |

#### S7 User sets `sourcemaps.filesToDeleteAfterUpload` (server unset)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | `NX/vite/sourceMaps.ts:89-115` |
| b | SDK sets `sourcemap.server = 'hidden'`. | `NX/vite/sourceMaps.ts:57` |
| c | Yes. | `BP/rollup/index.ts:220-223` |
| d | Read from disk by the plugin. | `BP/rollup/index.ts:277-294` |
| e | The user's glob replaces `<serverDir>/**/*.map`. The SDK runs it at Nitro `buildStart` (public dir files) and at `close`. Sentry-enabled server maps that the glob does not match stay. | `NX/vite/sourceMaps.ts:231-235`; `NX/vite/sourceMapDeletion.ts:117-138,144-161` |
| f | nothing | |

#### S8 `deleteSourcemapsAfterUpload: true` with S2

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | `NX/vite/sourceMaps.ts:89-115` |
| b | none | |
| c | Yes. | `BP/rollup/index.ts:220-223` |
| d | Read from disk by the plugin. | `BP/rollup/index.ts:277-294` |
| e | None removed. The option is forced to `false` for the server and there is no glob for user-enabled maps. The server maps stay. | `NX/vite/sourceMapDeletion.ts:112`; `NX/vite/sourceMaps.ts:61` |
| f | nothing | |

#### S9 `deleteSourcemapsAfterUpload: false` (server unset)

| Point | Answer | Evidence |
|---|---|---|
| a-d | As S1. | |
| e | As S1. The SDK glob still deletes `<serverDir>/**/*.map`. The option is not read for the server. | `NX/vite/sourceMaps.ts:190-200`; `NX/vite/sourceMapDeletion.ts:20-30` |
| f | nothing | |

#### S10 Development mode

| Point | Answer | Evidence |
|---|---|---|
| a | No. Detection: `nitroConfig.dev` in `nitro:config`, `nitro.options.dev` in `nitro:init`, `nuxt.options.dev` in `modules:done` and `close`, and `nuxt.options._prepare` in all four. | `NX/vite/sourceMaps.ts:50,90,119,141` |
| b | none | |
| c | No. | |
| d | Nothing. | |
| e | Nothing. | |
| f | No server release injection in dev (no plugin). | |

### Mechanics

| Item | Answer | Evidence |
|---|---|---|
| Plugin entry | `sentryRollupPlugin` from `@sentry/bundler-plugins/rollup` for upload. `createSentryBuildPluginManager().deleteArtifacts()` for the deletion at `close`. `globFiles` + `fs.rm` for the deletion at Nitro `buildStart`. | `NX/vite/sourceMaps.ts:2,112-114`; `NX/vite/sourceMapDeletion.ts:132-137,151-160` |
| Builds | Nitro's Rollup build only (the plugin is added in the `nitro:config` hook). With the Nuxt Vite server (`server.builder: 'vite'`, no Nitro) the SDK has no other place where it adds a server plugin; that the `nitro:*` hooks do not fire there: not confirmed. | `NX/vite/sourceMaps.ts:89,118`; `NX/vite/viteServer.ts:12` |
| When the upload runs | In `writeBundle` of Nitro's Rollup build. Deletion: Nitro `buildStart` (public dir) and Nuxt `close`. | `BP/rollup/index.ts:268-294`; `NX/vite/sourceMaps.ts:127-135,140-144` |
| Option mapping | Explicit key list in `getPluginOptions`, `release` spread, then `withoutSourceMapDeletion`. | `NX/vite/sourceMaps.ts:159-202`; `NX/vite/sourceMapDeletion.ts:106-115` |
| Development mode | `nitroConfig.dev`, `nitro.options.dev`, `nuxt.options.dev`, `nuxt.options._prepare`. | `NX/vite/sourceMaps.ts:50,90,119,141` |

---

## Column: Nitro

`@sentry/nitro` (`withSentryConfig` / `setupSentryNitroModule`). No bundler plugin. "Unset" means the Nitro config key `sourcemap` is `undefined` when `configureSourcemapSettings` runs.

### Matrix A

| # | Option | Value | Note | Evidence |
|---|---|---|---|---|
| 1 | `sourcemaps.disable` | `true`: turned into something else. `'disable-upload'`: passed through, and read by the SDK | `true`: the SDK does not change `sourcemap` and registers no `compiled` hook. `'disable-upload'`: Sentry still turns hidden maps on, creates the release and injects debug IDs; the SDK skips the upload and `deleteArtifacts`. | `NI/sourceMaps.ts:30,140-143`; `:51-61,110` |
| 2 | `sourcemaps.assets` | passed through | Direct mode: each entry goes to the CLI as a folder, in place of the server dir. Debug ID injection still uses the server dir only. `assets: []` blocks the upload. | `NI/sourceMaps.ts:53,111`; `BP/core/build-plugin-manager.ts:702-710,1057-1058` |
| 3 | `sourcemaps.ignore` | passed through | Goes to the CLI inject (default `node_modules` when unset) and to the CLI upload. | `NI/sourceMaps.ts:112`; `BP/core/build-plugin-manager.ts:648,731`; `BP/core/cli.ts:156-161` |
| 4 | `sourcemaps.filesToDeleteAfterUpload` | default set by SDK; user value replaces default | Default `["<serverDir>/**/*.map"]` when Sentry turned the maps on. `deleteArtifacts` runs after the upload call, also when the upload did not run. It does not run with `'disable-upload'`. | `NI/sourceMaps.ts:55-61,89-90,113` |
| 5 | `sourcemaps.deleteSourcemapsAfterUpload` | dropped | In the type (`SentryNitroOptions = BuildTimeOptionsBase`). `getPluginOptions` does not read it. | `NI/config.ts:6`; `NI/sourceMaps.ts:99-123`; `CORE/buildTimeOptionsBase.ts:274` |
| 6 | `sourcemaps.rewriteSources` | never applied (default set by SDK) | The SDK sets `normalizePath` as default. Direct mode does not call the hook. The hook is used only on the prepare route and in staging. | `NI/sourceMaps.ts:67-69,114`; `BP/core/build-plugin-manager.ts:698-740,788,887` |
| 7 | `sourcemaps.resolveSourceMap` | dropped | Not read. | `NI/sourceMaps.ts:109-115` |
| 8 | `release.inject` | never applied | `release` is passed, but only the bundler plugins inject the release. The SDK does not. | `NI/sourceMaps.ts:116`; `BP/rollup/index.ts:132-145` |
| 9 | `release.name/create/finalize/dist/setCommits/deploy` | passed through | The whole object. `createRelease` uses them. `dist` also goes to the upload. | `NI/sourceMaps.ts:51,116`; `BP/core/build-plugin-manager.ts:529-634,730` |
| 10 | `org`, `project`, `authToken`, `sentryUrl` | default set by SDK | `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `SENTRY_URL`. `sentryUrl` goes to `url`. | `NI/sourceMaps.ts:100-103` |
| 11 | `bundleSizeOptimizations` | never applied | Passed to the manager. The manager only calculates replacement values. The SDK does not read them. | `NI/sourceMaps.ts:117`; `BP/core/build-plugin-manager.ts:423-448` |
| 12 | `applicationKey`, `moduleMetadata` | dropped | In the type, not read. | `NI/sourceMaps.ts:99-123` |
| 13 | `debug`, `silent`, `telemetry`, `errorHandler` | default set by SDK (`false`, `false`, `true`); `errorHandler` passed through | | `NI/sourceMaps.ts:105-108` |
| 14 | SDK-only options | none | The type has no keys of its own. Nitro's own `sourcemap`, `dev` and `preset` keys decide if the hook is registered. | `NI/config.ts:6`; `NI/sourceMaps.ts:24-32` |
| 15 | Extra keys | No | Explicit key list. `release` is passed as one object, so extra keys in `release` reach the manager. `headers` is in the list. | `NI/sourceMaps.ts:99-123` |

### Matrix B

#### S1 Default build (unset)

| Point | Answer | Evidence |
|---|---|---|
| a | No bundler plugin. The SDK's own step runs in the Nitro `compiled` hook with `createSentryBuildPluginManager`. | `NI/sourceMaps.ts:16-18,45-48` |
| b | SDK sets Nitro `sourcemap = 'hidden'` (server) and `experimental.sourcemapMinify = false`. | `NI/sourceMaps.ts:175,188-189` |
| c | Yes, after the build, by the CLI on the files in the server dir. | `NI/sourceMaps.ts:53`; `BP/core/cli.ts:156-161` |
| d | The server dir is handed to the CLI (direct mode). | `NI/sourceMaps.ts:56-59`; `BP/core/build-plugin-manager.ts:698-734` |
| e | SDK glob `<serverDir>/**/*.map` through `deleteArtifacts` after the upload call. Every `.map` file under the server dir. | `NI/sourceMaps.ts:60,89-90,113` |
| f | nothing switched off by this situation. (Release injection and bundle size optimisations do not exist in this column: rows 8 and 11.) | |

#### S2 User turned source maps on (`sourcemap: true` or `'hidden'`)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes (hook). | `NI/sourceMaps.ts:16-18` |
| b | none. `true` and `'hidden'` are the same to the SDK. `sourcemapMinify = false` is still set. | `NI/sourceMaps.ts:165-171,188-189` |
| c | Yes (CLI). | `NI/sourceMaps.ts:53` |
| d | Server dir handed to the CLI. | `NI/sourceMaps.ts:56-59` |
| e | None. No default glob, because `sentryEnabledSourcemaps` is false. Maps stay. | `NI/sourceMaps.ts:89-90` |
| f | nothing | |

#### S3 User turned source maps off (`sourcemap: false`)

| Point | Answer | Evidence |
|---|---|---|
| a | No. The hook is not registered. Same for `sourcemap: 'inline'`. | `NI/sourceMaps.ts:28-29` |
| b | none. Warning. `sourcemapMinify` is not changed (early return). | `NI/sourceMaps.ts:148-162` |
| c | No. | |
| d | Nothing. | |
| e | Nothing. | |
| f | Release creation is off too: `createRelease` is in the skipped hook. | `NI/sourceMaps.ts:51` |

#### S4 No auth token (unset)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes (hook). | `NI/sourceMaps.ts:16-18` |
| b | `sourcemap = 'hidden'`. | `NI/sourceMaps.ts:175` |
| c | The SDK calls the CLI inject; the manager has no token check there. Whether the CLI inject works without a token: not confirmed (CLI package). | `NI/sourceMaps.ts:53`; `BP/core/build-plugin-manager.ts:643-656` |
| d | Nothing. Blocker `no-auth-token`, with a warning. | `BP/core/build-plugin-manager.ts:674-677,1086-1090` |
| e | The SDK glob still runs, because the SDK does not check the upload result. The Sentry-enabled maps are deleted without an upload. | `NI/sourceMaps.ts:55-61` |
| f | Release creation is skipped, with a warning. | `BP/core/build-plugin-manager.ts:538-542` |

#### S5 `sourcemaps.disable: true`

| Point | Answer | Evidence |
|---|---|---|
| a | No. | `NI/sourceMaps.ts:30` |
| b | none. `sourcemapMinify` is not changed. | `NI/sourceMaps.ts:140-143` |
| c | No. | |
| d | Nothing. | |
| e | Nothing. | |
| f | Release creation is off. | `NI/sourceMaps.ts:51` |

#### S6 `sourcemaps.disable: 'disable-upload'` (unset)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes (hook). | `NI/sourceMaps.ts:30` |
| b | `sourcemap = 'hidden'` (the check is `=== true` only). | `NI/sourceMaps.ts:140,175` |
| c | Yes (CLI). | `NI/sourceMaps.ts:53` |
| d | Nothing. | `NI/sourceMaps.ts:55` |
| e | Nothing removed. `deleteArtifacts` is in the same `if` as the upload. The Sentry-enabled hidden maps stay in the server dir. | `NI/sourceMaps.ts:55-61` |
| f | nothing. Release creation still runs. | `NI/sourceMaps.ts:51` |

#### S7 User sets `sourcemaps.filesToDeleteAfterUpload` (unset)

| Point | Answer | Evidence |
|---|---|---|
| a-d | As S1. | |
| e | The user's glob replaces the default. It runs after the upload call. Sentry-enabled maps that it does not match stay. | `NI/sourceMaps.ts:60,113` |
| f | nothing | |

#### S8 `deleteSourcemapsAfterUpload: true` with S2

| Point | Answer | Evidence |
|---|---|---|
| a-d | As S2. | |
| e | None removed. The option is not read. Maps stay. | `NI/sourceMaps.ts:99-123` |
| f | nothing | |

#### S9 `deleteSourcemapsAfterUpload: false` (unset)

| Point | Answer | Evidence |
|---|---|---|
| a-d | As S1. | |
| e | As S1. The default glob still deletes the Sentry-enabled maps. The option is not read. | `NI/sourceMaps.ts:89-90,99-123` |
| f | nothing | |

#### S10 Development mode

| Point | Answer | Evidence |
|---|---|---|
| a | No. Detection: `nitro.options.dev` in the module setup. Also skipped for `preset === 'nitro-prerender'`. The manager has its own check (`NODE_ENV === 'development'`). | `NI/sourceMaps.ts:12,26-27`; `BP/core/build-plugin-manager.ts:323` |
| b | `configureSourcemapSettings` has no dev check. With `sourcemap` unset it still sets `sourcemap = 'hidden'` and `sourcemapMinify = false`. | `NI/sourceMaps.ts:136-192`; `NI/config.ts:27` |
| c | No. | |
| d | Nothing. | |
| e | Nothing. | |
| f | Release creation is off. | `NI/sourceMaps.ts:51` |

### Mechanics

| Item | Answer | Evidence |
|---|---|---|
| Plugin entry | `createSentryBuildPluginManager` from `@sentry/bundler-plugins/core`, which calls the `sentry` CLI package. | `NI/sourceMaps.ts:2,45-48`; `BP/core/cli.ts:1` |
| Builds | The Nitro server output folder `nitro.options.output.serverDir`. | `NI/sourceMaps.ts:42` |
| When the upload runs | In the Nitro `compiled` hook, after the build. Order: telemetry signal, `createRelease`, `injectDebugIds`, `uploadSourcemaps`, `deleteArtifacts`. | `NI/sourceMaps.ts:16-18,50-61` |
| Option mapping | Explicit key list. | `NI/sourceMaps.ts:99-123` |
| Development mode | `nitro.options.dev`. | `NI/sourceMaps.ts:26` |

---

## Column: SolidStart 1

`withSentry` in `app.config.ts`, which adds `sentrySolidStartVite` to `solidStartConfig.vite`. "Unset" means `build.sourcemap` is `undefined` in the Vite config that the plugin `sentry-solidstart-update-source-map-setting` gets in its `config` hook.

The plugins are part of every Vite build that vinxi runs with `solidStartConfig.vite`. Which vinxi routers that is: not confirmed (vinxi code). The SDK adds no source map code to Nitro's own build of `.output/server` (`SS/config/withSentry.ts:70-110`).

### Matrix A

| # | Option | Value | Note | Evidence |
|---|---|---|---|---|
| 1 | `sourcemaps.disable` | `true`: turned into something else. `'disable-upload'`: passed through | `true`: the SDK adds no source map plugins (no setting change, no Vite plugin). `'disable-upload'`: reaches the plugin through the spread; the SDK default of row 5 stays `true` (S6). | `SS/vite/sentrySolidStartVite.ts:29`; `SS/vite/sourceMaps.ts:83-84` |
| 2 | `sourcemaps.assets` | passed through | Spread. | `SS/vite/sourceMaps.ts:83` |
| 3 | `sourcemaps.ignore` | passed through | Spread. | `SS/vite/sourceMaps.ts:83` |
| 4 | `sourcemaps.filesToDeleteAfterUpload` | passed through | Spread. The plugin runs it in the `finally` of each `writeBundle`. develop: **default set by SDK** `['.*/**/*.map']` when the user gave none and the static Vite config had no `build.sourcemap`; user value replaces default. | `SS/vite/sourceMaps.ts:83`; `BP/rollup/index.ts:304-306`; `HEAD~1:SS/vite/sourceMaps.ts:35-41,68` |
| 5 | `sourcemaps.deleteSourcemapsAfterUpload` | default set by SDK; user value replaces default | The SDK passes a function: the user's value when set, otherwise `true` for the top-level setting when the SDK turned the maps on, otherwise `undefined`. It also passes `sdkEnabledSourceMaps` (top-level setting only). develop: **passed through** (boolean in the spread). | `SS/vite/sourceMaps.ts:25-42,84,155` |
| 6 | `sourcemaps.rewriteSources` | passed through | No SDK default. The plugin default applies. | `SS/vite/sourceMaps.ts:83`; `BP/core/build-plugin-manager.ts:788,887` |
| 7 | `sourcemaps.resolveSourceMap` | passed through | Spread. Disk route only. | `SS/vite/sourceMaps.ts:83`; `BP/core/build-plugin-manager.ts:789` |
| 8 | `release.inject` | passed through | `release` is passed as one object. | `SS/vite/sourceMaps.ts:78` |
| 9 | `release.*` | passed through | None dropped, no SDK defaults. | `SS/vite/sourceMaps.ts:78` |
| 10 | `org`, `project`, `authToken`, `sentryUrl` | default set by SDK for three; `sentryUrl` passed through | Defaults `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`. `sentryUrl` goes to `url` with no SDK default (the plugin reads `SENTRY_URL`). | `SS/vite/sourceMaps.ts:70,76-77,81`; `BP/core/options-mapping.ts:107` |
| 11 | `bundleSizeOptimizations` | passed through | | `SS/vite/sourceMaps.ts:71` |
| 12 | `applicationKey`, `moduleMetadata` | passed through | | `SS/vite/sourceMaps.ts:69,75` |
| 13 | `debug`, `silent`, `telemetry`, `errorHandler` | default set by SDK for `debug` (`false`) and `telemetry` (`true`); `silent`, `errorHandler` passed through | | `SS/vite/sourceMaps.ts:72-73,79-80` |
| 14 | SDK-only options | none that change source maps, release or upload | The type adds `instrumentation`, `serverEntrypointFileName`, `autoInjectServerSentry`, `experimental_entrypointWrappedFunctions`. None is read by the source map code. `unstable_sentryVitePluginOptions` is removed and only gives a warning. | `SS/vite/types.ts:6-61`; `SS/vite/sentrySolidStartVite.ts:12` |
| 15 | Extra keys | No at the top level. Yes in `sourcemaps`. | Top level: explicit key list. `sourcemaps` is spread. `release` is passed as one object. | `SS/vite/sourceMaps.ts:51-91` |

### Matrix B

#### S1 Default build (unset)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. `sentryVitePlugin` is added when `NODE_ENV !== 'development'` and `disable !== true`. | `SS/vite/sentrySolidStartVite.ts:28-37`; `SS/vite/sourceMaps.ts:68` |
| b | SDK sets Vite `build.sourcemap = 'hidden'` in a `config` hook (`apply: 'build'`, `enforce: 'post'`), for each Vite build that has the plugin. | `SS/vite/sourceMaps.ts:149-162,213-214` |
| c | Yes. | `BP/rollup/index.ts:220-223` |
| d | Staged from memory, uploaded in `writeBundle`. | `BP/rollup/source-map-handling.ts:247-274`; `BP/rollup/index.ts:268-294` |
| e | The plugin removes all maps of the Vite build before write (delete option `true` from the SDK function, `removeAllSourceMaps`). The SDK does nothing with maps that Nitro writes later. develop: the plugin applied its own unset rule (its `config` hook ran before the SDK set `'hidden'`) and removed the maps before write; then the SDK default glob `.*/**/*.map` ran after each upload. | `SS/vite/sourceMaps.ts:33-39`; `BP/core/sourcemap-settings.ts:129-133`; `BP/rollup/source-map-handling.ts:230-235,271-273`; `HEAD~1:SS/vite/sentrySolidStartVite.ts:33-36`; `HEAD~1:SS/vite/sourceMaps.ts:35-41` |
| f | nothing | |

#### S2 User turned source maps on (`build.sourcemap: true` or `'hidden'`)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | `SS/vite/sentrySolidStartVite.ts:28-37` |
| b | none. `true`, `'hidden'` and `'inline'` are kept. | `SS/vite/sourceMaps.ts:205-212` |
| c | Yes. | `BP/rollup/index.ts:220-223` |
| d | Read from disk by the plugin. | `BP/rollup/index.ts:277-294` |
| e | None removed. `sdkEnabledSourceMaps` is false, so the delete option is `undefined`. Maps stay. | `SS/vite/sourceMaps.ts:37-39,155`; `BP/core/sourcemap-settings.ts:129-138` |
| f | nothing | |

#### S3 User turned source maps off (`build.sourcemap: false`)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | `SS/vite/sentrySolidStartVite.ts:28-37` |
| b | none. Warning. | `SS/vite/sourceMaps.ts:192-204` |
| c | Yes. | `BP/rollup/index.ts:220-223` |
| d | Nothing (P-off; bundles without a map are skipped). | `BP/core/sourcemap-settings.ts:84-93`; `BP/core/debug-id-upload.ts:74-85` |
| e | No maps exist. | |
| f | nothing | |

#### S4 No auth token (unset)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | `SS/vite/sentrySolidStartVite.ts:28-37` |
| b | SDK still sets `build.sourcemap = 'hidden'` (no token check). | `SS/vite/sourceMaps.ts:182-224` |
| c | Yes. | `BP/rollup/index.ts:220-223` |
| d | Nothing. | `BP/core/build-plugin-manager.ts:1063-1064` |
| e | The plugin removes all maps of the Vite build before write, without an upload (P-noupload). develop: maps are written; the SDK default glob `.*/**/*.map` (`.map` files in top-level dot folders) runs in the `finally` of `writeBundle`, without an upload. | `BP/core/sourcemap-settings.ts:55-80`; `BP/rollup/source-map-handling.ts:237-245`; `HEAD~1:SS/vite/sourceMaps.ts:35-41`; `BP/rollup/index.ts:304-306` |
| f | Release creation is skipped. | `BP/core/build-plugin-manager.ts:538-542` |

#### S5 `sourcemaps.disable: true`

| Point | Answer | Evidence |
|---|---|---|
| a | No. | `SS/vite/sentrySolidStartVite.ts:29` |
| b | none | `SS/vite/sentrySolidStartVite.ts:29-37` |
| c | No. | |
| d | Nothing. | |
| e | Nothing. | |
| f | Release injection, release creation, bundle size optimisations and metadata injection are off. Only the Vite plugin gets these options. | `SS/vite/sourceMaps.ts:68-91` |

#### S6 `sourcemaps.disable: 'disable-upload'` (unset)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | `SS/vite/sentrySolidStartVite.ts:29` |
| b | SDK sets `build.sourcemap = 'hidden'`. | `SS/vite/sourceMaps.ts:213-214` |
| c | Yes, and stamped into the emitted chunks and maps. | `BP/rollup/index.ts:220-223,261-265,344-349` |
| d | Nothing. | `BP/rollup/index.ts:275` |
| e | The plugin removes all maps of the Vite build before write, without an upload. `keepWhenUploadDisabled` is `false` for SolidStart 1, so the delete option stays `true`. develop: maps are written with debug IDs; the SDK default glob `.*/**/*.map` then runs. | `SS/vite/sourceMaps.ts:39,84`; `BP/core/sourcemap-settings.ts:61-80`; `BP/rollup/source-map-handling.ts:237-245`; `HEAD~1:SS/vite/sourceMaps.ts:35-41` |
| f | nothing | |

#### S7 User sets `sourcemaps.filesToDeleteAfterUpload` (unset)

| Point | Answer | Evidence |
|---|---|---|
| a-c | As S1. | |
| d | Staged from memory. The SDK default delete does not depend on the glob. | `SS/vite/sourceMaps.ts:37-39` |
| e | The plugin removes all maps of the Vite build before write. Then the plugin runs the user's glob in the `finally` of each `writeBundle`. develop: the user's glob replaced the SDK default glob. | `BP/rollup/source-map-handling.ts:271-273`; `BP/rollup/index.ts:304-306`; `HEAD~1:SS/vite/sourceMaps.ts:68` |
| f | nothing | |

#### S8 `deleteSourcemapsAfterUpload: true` with S2

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. | |
| b | `true` (visible): the plugin switches `build.sourcemap` to `'hidden'`. `'hidden'`: no change. | `BP/core/sourcemap-settings.ts:135-149`; `BP/vite/source-map-hooks.ts:91` |
| c | Yes. | |
| d | Staged from memory. | `BP/rollup/source-map-handling.ts:247-274` |
| e | The plugin removes the maps of the staged chunks before write. Maps of chunks that `assets`/`ignore` exclude, and asset maps, stay (`removeAllSourceMaps` false). | `SS/vite/sourceMaps.ts:33-39`; `BP/rollup/source-map-handling.ts:268-274` |
| f | nothing | |

#### S9 `deleteSourcemapsAfterUpload: false` (unset)

| Point | Answer | Evidence |
|---|---|---|
| a-c | As S1. | |
| d | Read from disk by the plugin. | `BP/core/sourcemap-settings.ts:129-131`; `BP/rollup/index.ts:277-294` |
| e | None removed. The Sentry-enabled hidden maps stay. develop: the plugin kept them (unset rule with `false`), but the SDK default glob `.*/**/*.map` still ran. | `SS/vite/sourceMaps.ts:37-39`; `BP/core/sourcemap-settings.ts:106-116`; `HEAD~1:SS/vite/sourceMaps.ts:35-41` |
| f | nothing | |

#### S10 Development mode

| Point | Answer | Evidence |
|---|---|---|
| a | No. Detection: `process.env.NODE_ENV === 'development'` at the time `sentrySolidStartVite` is called. The SDK plugin also has `apply: 'build'`. | `SS/vite/sentrySolidStartVite.ts:28`; `SS/vite/sourceMaps.ts:151` |
| b | none | |
| c | No. | |
| d | Nothing. | |
| e | Nothing. | |
| f | Release injection, bundle size optimisations and metadata injection are not applied (no plugin). | |

### Mechanics

| Item | Answer | Evidence |
|---|---|---|
| Plugin entry | `sentryVitePlugin` from `@sentry/bundler-plugins/vite` | `SS/vite/sourceMaps.ts:1,68` |
| Builds | Every Vite build that uses `solidStartConfig.vite` (which vinxi routers: not confirmed). Not Nitro's own build. | `SS/config/withSentry.ts:60-65,133`; `SS/vite/sentrySolidStartVite.ts:47-59` |
| When the upload runs | In the plugin's `writeBundle` hook of each Vite build. | `BP/rollup/index.ts:268-294` |
| Option mapping | Explicit top-level key list; `sourcemaps` spread, then the two function options. | `SS/vite/sourceMaps.ts:51-91` |
| Development mode | `process.env.NODE_ENV === 'development'`. | `SS/vite/sentrySolidStartVite.ts:28` |

---

## Column: SolidStart 2

`sentrySolidStart()` in `vite.config.ts`. Two parts:

- **Client part**: the Sentry Vite plugin. Its user setting is Vite's top-level `build.sourcemap`. The JSDoc says it covers the client assets only (`SS/vite/sourceMaps.ts:98-99`). The SDK code sets no environment filter on the plugin. Whether its hooks also run in Nitro's Vite environments: not confirmed (Vite and Nitro code).
- **Server part**: `@sentry/nitro` (`setupSentryNitroModule`), same code as the Nitro column. Its user setting is the `nitro.sourcemap` key of the Vite config (`SS/vite/sentrySolidStart.ts:119,129`). It gets the full, unchanged options object (`:132`).

### Matrix A

| # | Option | Value | Note | Evidence |
|---|---|---|---|---|
| 1 | `sourcemaps.disable` | `true`: turned into something else (both parts). `'disable-upload'`: passed through (both parts) | Client `true`: no source map plugins. Server `true`: no `sourcemap` change, no hook. Client `'disable-upload'`: reaches the plugin; the SDK default of row 5 is switched off, so the maps stay. Server `'disable-upload'`: as the Nitro column. | `SS/vite/sentrySolidStart.ts:59`; `SS/vite/sourceMaps.ts:39,128-130`; `NI/sourceMaps.ts:30,55-61,140-143` |
| 2 | `sourcemaps.assets` | passed through (both parts) | The same value goes to the Vite plugin and to `@sentry/nitro`. Server: direct mode use, see Nitro row 2. | `SS/vite/sourceMaps.ts:128`; `NI/sourceMaps.ts:111` |
| 3 | `sourcemaps.ignore` | passed through (both parts) | | `SS/vite/sourceMaps.ts:128`; `NI/sourceMaps.ts:112` |
| 4 | `sourcemaps.filesToDeleteAfterUpload` | Client: passed through. Server: default set by SDK, user value replaces default | Client: the plugin runs it in the `finally` of `writeBundle`. Server: default `["<serverDir>/**/*.map"]`. A user glob runs in both parts. develop (client): **default set by SDK** `['./**/*.map']` when the user gave none and `build.sourcemap` was unset; user value replaces default. | `SS/vite/sourceMaps.ts:128`; `NI/sourceMaps.ts:89-90,113`; `HEAD~1:SS/vite/sourceMaps.ts:106-125,142` |
| 5 | `sourcemaps.deleteSourcemapsAfterUpload` | Client: default set by SDK, user value replaces default. Server: dropped | Client: function, `true` for the top-level setting when the SDK turned the maps on and `sourcemaps.disable` is not set. develop (client): **passed through**. Server: not read. | `SS/vite/sourceMaps.ts:25-42,130`; `NI/sourceMaps.ts:99-123` |
| 6 | `sourcemaps.rewriteSources` | Client: passed through. Server: never applied | Client: no SDK default. Server: default `normalizePath` is set, direct mode does not call it. | `SS/vite/sourceMaps.ts:128`; `NI/sourceMaps.ts:114`; `BP/core/build-plugin-manager.ts:698-740` |
| 7 | `sourcemaps.resolveSourceMap` | Client: passed through. Server: dropped | | `SS/vite/sourceMaps.ts:128`; `NI/sourceMaps.ts:109-115` |
| 8 | `release.inject` | Client: passed through. Server: never applied | Client: through the rest spread. | `SS/vite/sourceMaps.ts:116,120`; `NI/sourceMaps.ts:116` |
| 9 | `release.*` | passed through (both parts) | Both parts call `createRelease` with the same options. | `SS/vite/sourceMaps.ts:120`; `NI/sourceMaps.ts:51,116`; `BP/rollup/index.ts:273` |
| 10 | `org`, `project`, `authToken`, `sentryUrl` | Client: default set by SDK for three, `sentryUrl` passed through to `url`. Server: default set by SDK for all four | Env vars. | `SS/vite/sourceMaps.ts:121,123-124,126`; `NI/sourceMaps.ts:100-103` |
| 11 | `bundleSizeOptimizations` | Client: passed through. Server: never applied | Client: rest spread. | `SS/vite/sourceMaps.ts:120`; `NI/sourceMaps.ts:117` |
| 12 | `applicationKey`, `moduleMetadata` | Client: passed through. Server: dropped | Client: rest spread. | `SS/vite/sourceMaps.ts:120`; `NI/sourceMaps.ts:99-123` |
| 13 | `debug`, `silent`, `telemetry`, `errorHandler` | Client: default set by SDK for `debug` (`false`) and `telemetry` (`true`); `silent`, `errorHandler` passed through. Server: defaults `false`, `false`, `true` | | `SS/vite/sourceMaps.ts:120,122,125`; `NI/sourceMaps.ts:105-108` |
| 14 | SDK-only options | none | `SentrySolidStartOptions = BuildTimeOptionsBase`. `buildTimeInstrumentation` is removed before the spread. `unstable_sentryVitePluginOptions` only gives a warning. | `SS/vite/sentrySolidStart.ts:15,46`; `SS/vite/sourceMaps.ts:109` |
| 15 | Extra keys | Client: Yes. Server: No | Client: rest spread of the top-level options and spread of `sourcemaps`. Server: explicit key list. | `SS/vite/sourceMaps.ts:107-131`; `NI/sourceMaps.ts:99-123` |

### Matrix B

#### S1 Default build (`build.sourcemap` and `nitro.sourcemap` unset)

| Point | Answer | Evidence |
|---|---|---|
| a | Client: yes, `sentryVitePlugin`, when `NODE_ENV !== 'development'` and `disable !== true`. Server: yes, the `@sentry/nitro` module with its `compiled` hook. | `SS/vite/sentrySolidStart.ts:51-68,114-139`; `NI/config.ts:27-30` |
| b | Client: top-level `build.sourcemap = 'hidden'`. Server: `nitro.sourcemap = 'hidden'` and `nitro.experimental.sourcemapMinify = false`. | `SS/vite/sourceMaps.ts:149-162,213-214`; `NI/sourceMaps.ts:175,188-189` |
| c | Client: yes, in `renderChunk`. Server: yes, by the CLI on the server dir. | `BP/rollup/index.ts:220-223`; `NI/sourceMaps.ts:53` |
| d | Client: staged from memory. Server: server dir handed to the CLI. | `BP/rollup/source-map-handling.ts:247-274`; `NI/sourceMaps.ts:56-59` |
| e | Client: the plugin removes all maps before write. Server: SDK glob `<serverDir>/**/*.map`. develop (client): the plugin applied its own unset rule and removed the maps before write; the SDK default glob `./**/*.map` also ran. | `SS/vite/sourceMaps.ts:33-39`; `BP/core/sourcemap-settings.ts:129-133`; `NI/sourceMaps.ts:60,89-90`; `HEAD~1:SS/vite/sentrySolidStart.ts:59`; `HEAD~1:SS/vite/sourceMaps.ts:118-125` |
| f | nothing | |

#### S2 User turned source maps on

| Point | Answer | Evidence |
|---|---|---|
| a | Yes, both parts. | |
| b | `build.sourcemap: true`/`'hidden'`: client none. `nitro.sourcemap: true`/`'hidden'`: server none. The two settings are independent: if only one is set, Sentry still turns the other on. | `SS/vite/sourceMaps.ts:205-212`; `SS/vite/sentrySolidStart.ts:129`; `NI/sourceMaps.ts:165-171` |
| c | Yes, both parts. | |
| d | Client: read from disk by the plugin. Server: server dir handed to the CLI. | `BP/rollup/index.ts:277-294`; `NI/sourceMaps.ts:56-59` |
| e | User-enabled client maps stay (delete option `undefined`). User-enabled server maps stay (no default glob). | `SS/vite/sourceMaps.ts:37-39`; `NI/sourceMaps.ts:89-90` |
| f | nothing | |

#### S3 User turned source maps off

| Point | Answer | Evidence |
|---|---|---|
| a | `build.sourcemap: false`: client plugin still added. `nitro.sourcemap: false`: server hook not registered. | `SS/vite/sentrySolidStart.ts:59-67`; `NI/sourceMaps.ts:28` |
| b | none for the side that is off. Warnings from both parts. | `SS/vite/sourceMaps.ts:192-204`; `NI/sourceMaps.ts:148-153` |
| c | Client: yes. Server with `nitro.sourcemap: false`: no. | `BP/rollup/index.ts:220-223`; `NI/sourceMaps.ts:28` |
| d | Nothing for the side that is off. | |
| e | Nothing. | |
| f | Server with `nitro.sourcemap: false`: release creation in the Nitro hook is off (the Vite plugin still creates the release). | `NI/sourceMaps.ts:51`; `BP/rollup/index.ts:273` |

#### S4 No auth token (both unset)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes, both parts. | |
| b | Both still set to `'hidden'`. | `SS/vite/sourceMaps.ts:213-214`; `NI/sourceMaps.ts:175` |
| c | Client: yes. Server: the SDK calls the CLI inject (works without a token: not confirmed). | `BP/rollup/index.ts:220-223`; `NI/sourceMaps.ts:53` |
| d | Nothing. | `BP/core/build-plugin-manager.ts:1063-1064` |
| e | Client: the plugin removes all maps before write, without an upload. Server: the SDK glob still deletes `<serverDir>/**/*.map`. develop (client): maps written, then the SDK default glob `./**/*.map` ran, without an upload. | `BP/core/sourcemap-settings.ts:55-80`; `BP/rollup/source-map-handling.ts:237-245`; `NI/sourceMaps.ts:55-61`; `HEAD~1:SS/vite/sourceMaps.ts:118-125` |
| f | Release creation is skipped in both parts. | `BP/core/build-plugin-manager.ts:538-542` |

#### S5 `sourcemaps.disable: true`

| Point | Answer | Evidence |
|---|---|---|
| a | Client: no Sentry Vite plugin. Server: the Nitro module is still added (for instrumentation), but it registers no source map hook. | `SS/vite/sentrySolidStart.ts:48,59`; `NI/sourceMaps.ts:30`; `NI/module.ts:13-15` |
| b | none | `SS/vite/sentrySolidStart.ts:59`; `NI/sourceMaps.ts:140-143` |
| c | No. | |
| d | Nothing. | |
| e | Nothing. | |
| f | Release injection, release creation (both parts), bundle size optimisations and metadata injection are off. | `SS/vite/sourceMaps.ts:119-137`; `NI/sourceMaps.ts:51` |

#### S6 `sourcemaps.disable: 'disable-upload'` (both unset)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes, both parts. | `SS/vite/sentrySolidStart.ts:59`; `NI/sourceMaps.ts:30` |
| b | Both set to `'hidden'`. | `SS/vite/sourceMaps.ts:213-214`; `NI/sourceMaps.ts:140,175` |
| c | Client: yes, and stamped into the emitted chunks and maps. Server: yes (CLI). | `BP/rollup/index.ts:261-265,344-349`; `NI/sourceMaps.ts:53` |
| d | Nothing. | `BP/rollup/index.ts:275`; `NI/sourceMaps.ts:55` |
| e | Nothing removed in either part. Client: `keepWhenUploadDisabled` is `true`, so the delete option is `undefined` and the plugin makes no change. Server: `deleteArtifacts` is skipped. The Sentry-enabled hidden maps stay on both sides. develop (client): maps written with debug IDs, then the SDK default glob `./**/*.map` ran in the `finally` of `writeBundle`. | `SS/vite/sourceMaps.ts:39,130`; `BP/core/sourcemap-settings.ts:55-58`; `NI/sourceMaps.ts:55-61`; `HEAD~1:SS/vite/sourceMaps.ts:118-125`; `BP/rollup/index.ts:304-306` |
| f | nothing | |

#### S7 User sets `sourcemaps.filesToDeleteAfterUpload` (both unset)

| Point | Answer | Evidence |
|---|---|---|
| a-d | As S1. | |
| e | Client: the plugin still removes all maps before write (the SDK default does not depend on the glob), then runs the user's glob in the `finally` of `writeBundle`. Server: the user's glob replaces `<serverDir>/**/*.map`; Sentry-enabled server maps that it does not match stay. The glob runs in both parts. | `SS/vite/sourceMaps.ts:37-39,128`; `BP/rollup/index.ts:304-306`; `NI/sourceMaps.ts:60,113` |
| f | nothing | |

#### S8 `deleteSourcemapsAfterUpload: true` with S2

| Point | Answer | Evidence |
|---|---|---|
| a | Yes, both parts. | |
| b | Client with `build.sourcemap: true`: the plugin switches to `'hidden'`. Server: none. | `BP/core/sourcemap-settings.ts:135-149` |
| c | Yes, both parts. | |
| d | Client: staged from memory. Server: server dir handed to the CLI. | `BP/rollup/source-map-handling.ts:247-274`; `NI/sourceMaps.ts:56-59` |
| e | Client: the plugin removes the maps of the staged chunks before write; maps of excluded chunks and asset maps stay. Server: the option is not read; user-enabled server maps stay. | `BP/rollup/source-map-handling.ts:268-274`; `NI/sourceMaps.ts:99-123` |
| f | nothing | |

#### S9 `deleteSourcemapsAfterUpload: false` (both unset)

| Point | Answer | Evidence |
|---|---|---|
| a-c | As S1. | |
| d | Client: read from disk by the plugin. Server: as S1. | `BP/core/sourcemap-settings.ts:129-131`; `BP/rollup/index.ts:277-294` |
| e | Client: none removed; the Sentry-enabled hidden maps stay. Server: the option is not read; the default glob still deletes `<serverDir>/**/*.map`. develop (client): the plugin kept the maps, but the SDK default glob `./**/*.map` still ran. | `SS/vite/sourceMaps.ts:37-39`; `NI/sourceMaps.ts:89-90`; `HEAD~1:SS/vite/sourceMaps.ts:118-125` |
| f | nothing | |

#### S10 Development mode

| Point | Answer | Evidence |
|---|---|---|
| a | Client: no. Detection: `process.env.NODE_ENV === 'development'` when `sentrySolidStart()` is called; only the Nitro plugin and the server entry plugin are returned. Server: the Nitro module is added, and `@sentry/nitro` registers no hook when `nitro.options.dev`. | `SS/vite/sentrySolidStart.ts:48-53`; `NI/sourceMaps.ts:26` |
| b | Client: none. Server: `@sentry/nitro` still sets `nitro.sourcemap = 'hidden'` and `sourcemapMinify = false` when `nitro.sourcemap` is unset (no dev check). | `SS/vite/sentrySolidStart.ts:127-133`; `NI/sourceMaps.ts:136-192` |
| c | No. | |
| d | Nothing. | |
| e | Nothing. | |
| f | Release injection, bundle size optimisations and metadata injection are not applied (no Vite plugin). | |

### Mechanics

| Item | Answer | Evidence |
|---|---|---|
| Plugin entry | Client: `sentryVitePlugin` from `@sentry/bundler-plugins/vite`. Server: `setupSentryNitroModule` from `@sentry/nitro`, which uses `createSentryBuildPluginManager` and the `sentry` CLI package. | `SS/vite/sourceMaps.ts:1,119`; `SS/vite/sentrySolidStart.ts:6,127`; `NI/sourceMaps.ts:45` |
| Builds | Client part: the Vite build; no environment filter in SDK code. Server part: Nitro's server dir. | `SS/vite/sourceMaps.ts:119-137`; `NI/sourceMaps.ts:42` |
| When the upload runs | Client: plugin `writeBundle`. Server: Nitro `compiled` hook. | `BP/rollup/index.ts:268-294`; `NI/sourceMaps.ts:16-18` |
| Option mapping | Client: rest spread of the top-level options, spread of `sourcemaps`, then the two function options. Server: explicit key list in `@sentry/nitro`. | `SS/vite/sourceMaps.ts:107-131`; `NI/sourceMaps.ts:99-123` |
| Development mode | Client: `process.env.NODE_ENV === 'development'`. Server: `nitro.options.dev`. | `SS/vite/sentrySolidStart.ts:51`; `NI/sourceMaps.ts:26` |

---

## Surprises

1. **`deleteSourcemapsAfterUpload` does nothing on the server side.** Nuxt forces `false` on the Nitro Rollup plugin (`NX/vite/sourceMapDeletion.ts:112`). `@sentry/nitro` does not read it (`NI/sourceMaps.ts:99-123`), which also covers the server part of SolidStart 2. `false` does not keep the server maps that Sentry turned on (the SDK glob deletes them). `true` does not remove server maps that the user turned on. The JSDoc describes both behaviours without a limit to the client (`CORE/buildTimeOptionsBase.ts:256-274`).
2. **Maps that Sentry turned on are deleted when no upload runs, but not in every column.** No auth token: deleted in all five columns. `'disable-upload'`: deleted in Nuxt client (`NX/vite/sourceMapDeletion.ts:88-93`), Nuxt server (`NX/vite/sourceMaps.ts:44,140-144`) and SolidStart 1 (`SS/vite/sourceMaps.ts:84`); kept in Nitro (`NI/sourceMaps.ts:55-61`) and in both parts of SolidStart 2 (`SS/vite/sourceMaps.ts:130`).
3. **`filesToDeleteAfterUpload` has four different meanings.** Nuxt: it never reaches a plugin; the SDK runs it, and a user value turns off the default deletion of both sides (`NX/vite/sourceMapDeletion.ts:86,88-92`; `NX/vite/sourceMaps.ts:231-235`). Nitro: the user value replaces the default glob (`NI/sourceMaps.ts:113`). SolidStart 1 and the SolidStart 2 client: it is passed to the plugin and does not turn off the default deletion (`SS/vite/sourceMaps.ts:37-39,83,128`). In SolidStart 2 the same glob runs in the Vite plugin and in the Nitro hook.
4. **`@sentry/nitro` options with no effect.** `rewriteSources`: a default is set but direct mode never calls the hook (`NI/sourceMaps.ts:114`; `BP/core/build-plugin-manager.ts:698-740`). `resolveSourceMap`, `applicationKey`, `moduleMetadata`, `deleteSourcemapsAfterUpload`: in the type, not read. `release.inject` and `bundleSizeOptimizations`: passed to the manager, which does not apply them (`NI/sourceMaps.ts:116-117`).
5. **`sourcemaps.disable: true` switches off more than source maps.** In Nuxt, SolidStart 1 and the SolidStart 2 client no Sentry plugin is added, so release injection, release creation, bundle size optimisations and `applicationKey` / `moduleMetadata` injection stop too (`NX/vite/sourceMaps.ts:44,69,90`; `SS/vite/sentrySolidStartVite.ts:29`; `SS/vite/sentrySolidStart.ts:59`). In Nitro, release creation stops (`NI/sourceMaps.ts:30,51`). The JSDoc names only source map functions (`CORE/buildTimeOptionsBase.ts:214-224`).
6. **Nitro `sourcemap: false` or `'inline'` also skips release creation**, because the whole `compiled` hook is not registered (`NI/sourceMaps.ts:28-29,51`).
7. **`@sentry/nitro` changes the config in dev.** `configureSourcemapSettings` has no dev check: it sets `sourcemap = 'hidden'` and `sourcemapMinify = false` also for a dev server (`NI/sourceMaps.ts:136-192`; `NI/config.ts:27`). Only the upload hook checks `nitro.options.dev`.
8. **Nuxt and `'inline'`.** The type comment lists `'inline'` as "enabled" (`NX/vite/sourceMaps.ts:25-28`). In the object form the code replaces `'inline'` with `'hidden'` and treats the side as unset (`:294-297,306-309`). In the string form no `case` matches `'inline'` (`:269-286`).
9. **Nuxt defaults.** Repo comments say Nuxt's own default is `sourcemap: { server: true, client: false }`. If so, on a default Nuxt app the SDK's "unset" rules never run: no client maps and no client upload, and the server maps are uploaded and kept. Not confirmed from Nuxt code.
10. **Nuxt with webpack or rspack.** The SDK has no upload path for the client build, but it still sets `sourcemap.client = 'hidden'` when unset and then deletes the client maps with a public dir glob (`NX/vite/sourceMaps.ts:57,122-124`; `NX/vite/sourceMapDeletion.ts:27`).
11. **SolidStart 2 has two user settings.** Vite `build.sourcemap` decides for the client part and the `nitro.sourcemap` key of the Vite config decides for the server part (`SS/vite/sourceMaps.ts:186`; `SS/vite/sentrySolidStart.ts:129`). The JSDoc says the Vite plugin covers the client assets only, but the code sets no environment filter (`SS/vite/sourceMaps.ts:98-99,119-137`).
12. **`rewriteSources` default differs.** Nuxt and Nitro set `normalizePath` (`NX/vite/sourceMaps.ts:198`; `NI/sourceMaps.ts:114`). SolidStart sets none, so the plugin default applies (`SS/vite/sourceMaps.ts:83,128`).
13. **`SENTRY_URL` default differs.** Nuxt and Nitro read `SENTRY_URL` in the SDK (`NX/vite/sourceMaps.ts:172`; `NI/sourceMaps.ts:103`). SolidStart passes `sentryUrl` only and leaves the env var to the plugin (`SS/vite/sourceMaps.ts:81,126`). The result is the same.

## Not confirmed

- How Nuxt maps `sourcemap.client` / `sourcemap.server` to Vite `build.sourcemap` and to Nitro's Rollup `output.sourcemap`, and Nuxt's default for `sourcemap`. Looked at: `NX/vite/sourceMaps.ts` comments, e2e config comments. Nuxt and Nitro code is in `node_modules`.
- What `@nuxt/kit` `addVitePlugin` does with the webpack or rspack builder, and what `{ server: false }` does with the Nuxt 5 Vite environment API. Looked at: `NX/vite/sourceMaps.ts:71-86`, `NX/vite/sourceMapDeletion.ts:44-48,98-104`.
- Whether the `nitro:*` hooks fire with the Nuxt Vite server (`server.builder: 'vite'`). Looked at: `NX/vite/viteServer.ts`.
- Which vinxi routers (SolidStart 1) and which Vite environments (SolidStart 2) run the Sentry Vite plugin. Looked at: `SS/config/withSentry.ts`, `SS/vite/sentrySolidStart.ts`.
- Whether the CLI `sourcemap inject` call works without an auth token. Looked at: `BP/core/cli.ts:156-161`.
- Which files the develop default globs of SolidStart (`.*/**/*.map`, `./**/*.map`) match in a real build. Looked at: `BP/core/glob.ts:3-8` (no `dot` option is set).
