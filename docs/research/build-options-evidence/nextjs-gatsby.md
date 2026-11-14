# Next.js and Gatsby

Worktrees read: `.claude/worktrees/nextjs-delete-sourcemaps-69d1a8` (Next.js columns) and `.claude/worktrees/gatsby-delete-sourcemaps-3d160f` (Gatsby). `packages/bundler-plugins/src` is identical in the two worktrees (`diff -rq` shows no difference), so plugin line numbers apply to both.

Evidence paths use three prefixes. Expand them to get the path relative to the repo root:

- `nextjs/` = `packages/nextjs/src/config/`
- `plugin/` = `packages/bundler-plugins/src/`
- `gatsby/` = `packages/gatsby/`
- `core-types` = `packages/core/src/build-time-plugins/buildTimeOptionsBase.ts`

Terms: "staged" = the plugin copies chunk and map from memory before write and removes the map asset. "disk" = the plugin globs and reads files after write, then uploads a temp folder. "direct" = `uploadSourcemaps(paths, { prepareArtifacts: false })`, folders go to the CLI. All uploads call `sourcemap.upload` of the `sentry` CLI package (`plugin/core/cli.ts:1`, `:136`). `<dist>` = the absolute Next.js `distDir` (default `.next`).

Limit that applies to several cells: the SDK only tests `newConfig.devtool` for truthiness. Which `devtool` Next.js sets for `productionBrowserSourceMaps` or `experimental.serverSourceMaps` is Next.js code and is not in this repo. Cells that depend on it say so.

---

## Column: Next.js webpack (plugin in the compilers, `useRunAfterProductionCompileHook` off)

### Matrix A

| # | Option | Value | Note | Evidence |
|---|---|---|---|---|
| 1 | `sourcemaps.disable` | default set by SDK: `false`. User value passed through | The SDK also reads it. Any truthy value (`true` or `'disable-upload'`): the SDK does not set `devtool` and does not default `deleteSourcemapsAfterUpload`. The plugin is still added. `true`: plugin injects no debug IDs and uploads nothing. `'disable-upload'`: plugin injects debug IDs into JS and stamps maps that exist, no upload | `nextjs/getBuildPluginOptions.ts:359`; `nextjs/webpack.ts:363`; `plugin/webpack/index.ts:327`, `:418`, `:499-515`, `:556` |
| 2 | `sourcemaps.assets` | default set by SDK; user value replaces default | Default client: `<dist>/static/chunks/pages/**` and `<dist>/static/chunks/app/**` (`<dist>/static/chunks/**` with `widenClientFileUpload`). Default server and edge: `<dist>/server/**`, `<dist>/serverless/**`. A user value goes unchanged to all three compilers | `nextjs/getBuildPluginOptions.ts:123-141`, `:361` |
| 3 | `sourcemaps.ignore` | default set by SDK; user value added to default | Defaults: `<dist>/static/chunks/main-*` (not with `widenClientFileUpload`), `framework-*`, `framework.*`, `polyfills-*`, `webpack-*`, seven `**/*-manifest.js` patterns. Same list for client, server, edge | `nextjs/getBuildPluginOptions.ts:149-179`, `:263-270`, `:309`, `:362` |
| 4 | `sourcemaps.filesToDeleteAfterUpload` | passed through (string made an array) | No SDK default for webpack compilers. All three compilers get the user globs and each plugin instance runs them. Setting it turns off the plugin's own client map removal. develop: default set by SDK for the client compiler, `<dist>/static/**/*.{js,mjs,cjs,css}.map` when `deleteSourcemapsAfterUpload` is true; user value replaces default | `nextjs/getBuildPluginOptions.ts:185-195`, `:212`, `:320-325`, `:363`; `plugin/webpack/index.ts:572`; develop: `HEAD~1:packages/nextjs/src/config/getBuildPluginOptions.ts:184-206`, `:311-321` |
| 5 | `sourcemaps.deleteSourcemapsAfterUpload` | default set by SDK: `true`; turned into something else | Default is set in the client compiler call, by a write to the user's options object, only when `sourcemaps.disable` is falsy. Client: mapped to the plugin's `deleteSourcemapsAfterUpload` and `sdkEnabledSourceMaps` (same boolean), true only when the user did not set `filesToDeleteAfterUpload`. Server and edge: forced `false`. develop: turned into the `filesToDeleteAfterUpload` glob (row 4); nothing passed to the plugin | `nextjs/webpack.ts:386-394`; `nextjs/getBuildPluginOptions.ts:200-215`, `:299`, `:329-336`, `:364-367` |
| 6 | `sourcemaps.rewriteSources` | default set by SDK; user value replaces default | Default `rewriteWebpackSources`: removes a leading `webpack://` or `webpack://_N_E/`. Used on the staged and the disk route | `nextjs/getBuildPluginOptions.ts:227-229`, `:360`; `plugin/core/build-plugin-manager.ts:788`, `:887` |
| 7 | `sourcemaps.resolveSourceMap` | passed through; never applied for the client by default | Only the disk route calls it. Server and edge: applied. Client: staged by default, and staging takes the map from memory without the hook. Client uses the disk route when deletion is off or `filesToDeleteAfterUpload` is set | `nextjs/getBuildPluginOptions.ts:368`; `plugin/core/build-plugin-manager.ts:789`, `:925-930`; `plugin/core/debug-id-upload.ts:110-116` |
| 8 | `release.inject` | not in type; forced `false` | The SDK injects the release itself through its value injection loader, not in dev and not with `release.create: false` | `nextjs/types.ts:208`; `nextjs/getBuildPluginOptions.ts:240`, `:252`; `nextjs/webpack.ts:705-714` |
| 9 | `release.name`, `create`, `finalize`, `dist`, `setCommits`, `deploy` | `name`: default set by SDK. Others: passed through | `name` default: `release.name ?? getSentryRelease() ?? getGitRevision()`, only when `release.create !== false`. When no name resolves the SDK passes only `{ inject: false, create: false, finalize: false }`: `dist`, `setCommits`, `deploy`, `vcsRemote` are dropped. Each of the three plugin instances calls `createRelease()` | `nextjs/withSentryConfig/getFinalConfigObjectUtils.ts:59-64`; `nextjs/getBuildPluginOptions.ts:234-256`; `plugin/webpack/index.ts:555` |
| 10 | `org`, `project`, `authToken`, `sentryUrl` | passed through | `sentryUrl` goes to the plugin key `url`. No SDK default. The plugin falls back to `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `SENTRY_URL` | `nextjs/getBuildPluginOptions.ts:342-345`, `:357`; `plugin/core/options-mapping.ts:98-107` |
| 11 | `bundleSizeOptimizations` | passed through, and turned into something else | Passed (shallow copy) to the plugin, which adds a `DefinePlugin`. The SDK also adds its own `DefinePlugin` for five flags (`excludeDebugStatements`, `excludeTracing`, `excludeReplayIframe`, `excludeReplayShadowDom`, `excludeReplayWorker`), with `webpack.treeshake` as fallback, in dev too | `nextjs/getBuildPluginOptions.ts:371-373`; `plugin/webpack/index.ts:519-522`; `nextjs/webpack.ts:420`, `:874-917` |
| 12 | `applicationKey`, `moduleMetadata` | `applicationKey`: passed through for client, forced `undefined` for server and edge. `moduleMetadata`: passed through to all three | | `nextjs/getBuildPluginOptions.ts:340-341`, `:374` |
| 13 | `debug`, `silent`, `telemetry`, `errorHandler` | passed through | No SDK default. `debug` and `silent` are also read by the SDK's own logger. `headers` is passed through too | `nextjs/getBuildPluginOptions.ts:343`, `:346-348`, `:356`, `:291` |
| 14 | SDK-only options | see note | `widenClientFileUpload` (default `false`): client `assets` become `<dist>/static/chunks/**` and the `main-*` ignore is dropped. `useRunAfterProductionCompileHook` (default `false` for webpack): `true` moves the build to the next column. `webpack.disableSentryConfig` (default unset): no webpack function, so no plugin, no `devtool`, no value injection. Next.js `output: 'export'`: no plugin and no `devtool` for server compilers. `release.create: false`: no fallback release name and no release value injection | `nextjs/getBuildPluginOptions.ts:132-139`, `:156-158`; `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:155-161`, `:347`; `nextjs/webpack.ts:353-357`, `:705-714` |
| 15 | Extra keys | no spread at the top level | Explicit key list. Only `bundleSizeOptimizations` and `reactComponentAnnotation` are spread, so extra keys inside those two reach the plugin. `sourcemaps` and `release` use explicit keys | `nextjs/getBuildPluginOptions.ts:338-381`, `:351-354`, `:371-373`, `:238-248` |

### Matrix B

#### S1 Default build

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. One `sentryWebpackPlugin` instance per compiler (client, server, edge). Not for server compilers with `output: 'export'` | `nextjs/webpack.ts:353-362`, `:397-416` |
| b | Client: `devtool: 'hidden-source-map'`. Server and edge: `devtool: 'source-map'`. Set when `newConfig.devtool` is falsy, after the user's webpack function ran | `nextjs/webpack.ts:99-101`, `:371-383` |
| c | Yes, by the plugin: a debug ID snippet goes into each JS chunk | `plugin/webpack/index.ts:327`, `:390-421` |
| d | Client: staged from memory, for chunks that match `assets` and not `ignore`; uploaded in `afterEmit`. Server and edge: read from disk by the plugin in `afterEmit`. develop: client also read from disk | `nextjs/getBuildPluginOptions.ts:364-367`; `plugin/core/sourcemap-settings.ts:129-133`; `plugin/webpack/index.ts:459-469`, `:543-560`; `plugin/core/build-plugin-manager.ts:742-841`, `:918` |
| e | Client: the plugin removes all maps before write, CSS maps and maps of chunks left out of the upload included. Server and edge maps stay. develop: client maps deleted from disk after upload by the plugin's `deleteArtifacts` with the SDK glob `<dist>/static/**/*.{js,mjs,cjs,css}.map` | `plugin/webpack/index.ts:257-298`, `:446`, `:466`; `nextjs/getBuildPluginOptions.ts:206-214`; develop: `HEAD~1:packages/nextjs/src/config/getBuildPluginOptions.ts:205` |
| f | Nothing. (The plugin's release injection is always off in Next.js, row A8) | `nextjs/getBuildPluginOptions.ts:240` |

#### S2 User turned source maps on

| Point | Answer | Evidence |
|---|---|---|
| a | Yes, as S1 | `nextjs/webpack.ts:397-416` |
| b | None for a compiler whose `devtool` is already truthy. Visible client `devtool` (for example `source-map`): the plugin changes it to `hidden-source-map`, because the delete default is true. Hidden: no change. A compiler the user did not configure still gets the S1 value. Not confirmed: which `devtool` `productionBrowserSourceMaps: true` gives (Next.js code) | `nextjs/webpack.ts:371`; `plugin/webpack/index.ts:368-370`; `plugin/core/sourcemap-settings.ts:129-149` |
| c | Yes | `plugin/webpack/index.ts:418-421` |
| d | As S1: client staged, server and edge from disk | `plugin/webpack/index.ts:459-469` |
| e | Client: all maps removed before write, also these user-enabled maps (`sdkEnabledSourceMaps` is true whoever turned them on). Server and edge maps stay. develop: plugin makes no `devtool` change, so the `sourceMappingURL` comment of a visible map stays; maps deleted from disk by the SDK glob | `nextjs/getBuildPluginOptions.ts:365-367`; `nextjs/webpack.ts:386-394`; `plugin/core/sourcemap-settings.ts:133`, `:139-142` |
| f | Nothing | |

#### S3 User turned source maps off

| Point | Answer | Evidence |
|---|---|---|
| a | Yes | `nextjs/webpack.ts:397-416` |
| b | Same as S1. `devtool: false` is falsy, so the SDK sets `hidden-source-map` (client) and `source-map` (server, edge). The user's webpack function runs before the check, so a `devtool: false` from there is replaced too | `nextjs/webpack.ts:99-101`, `:371-383` |
| c | Yes | `plugin/webpack/index.ts:418-421` |
| d | As S1 | |
| e | As S1 | |
| f | Nothing | |

#### S4 No auth token

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. The SDK has no token check | `nextjs/webpack.ts:357-416` |
| b | As S1. No token check before `devtool` is set | `nextjs/webpack.ts:363-383` |
| c | Yes. Injection depends only on `sourcemaps.disable` | `plugin/webpack/index.ts:327`, `:418` |
| d | Nothing. The plugin logs a warning and returns | `plugin/core/build-plugin-manager.ts:674-677`, `:1063-1065`, `:1086-1090` |
| e | Client: all maps removed before write without an upload (`dropSourceMaps`, all maps), with a warning. Server and edge maps stay. develop: client maps deleted from disk by the SDK glob; `deleteArtifacts` runs in `finally` | `plugin/webpack/index.ts:453-458`; `plugin/core/sourcemap-settings.ts:55-80`; `plugin/webpack/index.ts:570-573` |
| f | Release creation is skipped (no token) | `plugin/core/build-plugin-manager.ts:538-542` |

#### S5 `sourcemaps.disable: true`

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. The plugin is added outside the `disable` check | `nextjs/webpack.ts:363`, `:397-416` |
| b | None | `nextjs/webpack.ts:363` |
| c | No | `plugin/webpack/index.ts:327`, `:418` |
| d | Nothing | `plugin/webpack/index.ts:556` |
| e | None removed. The delete default is not set, so the plugin gets `false`. With an explicit `deleteSourcemapsAfterUpload: true` and user-enabled maps, the plugin removes all client maps before write | `nextjs/webpack.ts:363`, `:386`; `nextjs/getBuildPluginOptions.ts:299`, `:364-367`; `plugin/core/sourcemap-settings.ts:55-80` |
| f | Nothing else. Release creation, the bundle size `DefinePlugin`, metadata injection and component annotation still run | `plugin/webpack/index.ts:346-348`, `:376`, `:519-541`, `:555` |

#### S6 `sourcemaps.disable: 'disable-upload'`

| Point | Answer | Evidence |
|---|---|---|
| a | Yes | `nextjs/webpack.ts:397-416` |
| b | None. The string is truthy, so the SDK skips `devtool` | `nextjs/webpack.ts:363` |
| c | Yes. Snippet in each JS chunk, and the debug ID is stamped into emitted JS and into maps that exist | `plugin/webpack/index.ts:418-421`, `:499-515` |
| d | Nothing | `plugin/webpack/index.ts:556` |
| e | None removed (as S5) | `nextjs/webpack.ts:363`, `:386` |
| f | Nothing | |

#### S7 User sets `filesToDeleteAfterUpload`

| Point | Answer | Evidence |
|---|---|---|
| a | Yes | `nextjs/webpack.ts:397-416` |
| b | As S1 | `nextjs/webpack.ts:371-383` |
| c | Yes | `plugin/webpack/index.ts:418-421` |
| d | Client, server and edge all read from disk. The client is not staged, because the plugin gets `deleteSourcemapsAfterUpload: false` | `nextjs/getBuildPluginOptions.ts:212`, `:329-336`; `plugin/core/sourcemap-settings.ts:129-131` |
| e | Only what the user globs match, deleted from disk by `deleteArtifacts`. Each of the three plugin instances runs the globs in its own `afterEmit`. The SDK-enabled client maps stay unless a glob matches them | `nextjs/getBuildPluginOptions.ts:320-325`; `plugin/webpack/index.ts:572`; `plugin/core/build-plugin-manager.ts:1009-1031` |
| f | Nothing | |

#### S8 `deleteSourcemapsAfterUpload: true` with S2

| Point | Answer | Evidence |
|---|---|---|
| a-f | Same as S2. The default is already `true` for the client compiler. The option never reaches the server and edge compilers (forced `false`), so their maps stay | `nextjs/webpack.ts:386-394`; `nextjs/getBuildPluginOptions.ts:206-214` |

#### S9 `deleteSourcemapsAfterUpload: false`

| Point | Answer | Evidence |
|---|---|---|
| a | Yes | `nextjs/webpack.ts:397-416` |
| b | As S1. The SDK still sets `devtool` | `nextjs/webpack.ts:371-383` |
| c | Yes | `plugin/webpack/index.ts:418-421` |
| d | All three compilers read from disk | `plugin/core/sourcemap-settings.ts:129-131`, `:135-138` |
| e | None removed. Client maps stay in `<dist>/static` | `nextjs/getBuildPluginOptions.ts:299`, `:364` |
| f | Nothing | |

#### S10 Development mode

Detection: `buildContext.dev`, which Next.js passes to the webpack function (`nextjs/webpack.ts:71`, `:357`).

| Point | Answer | Evidence |
|---|---|---|
| a | No plugin | `nextjs/webpack.ts:357` |
| b | None | `nextjs/webpack.ts:357`, `:363-383` |
| c | No | |
| d | Nothing | |
| e | None | |
| f | The SDK's release value injection is off in dev. The SDK's tree-shake `DefinePlugin` is still added | `nextjs/webpack.ts:714`, `:420` |

### Mechanics

| Item | Answer | Evidence |
|---|---|---|
| Plugin entry | `sentryWebpackPlugin` from `@sentry/bundler-plugins/webpack`, loaded with `loadModule`. If the load fails, no plugin is added and nothing is logged | `nextjs/webpack.ts:358-362` |
| Builds | Client, server (Node.js) and edge compilers, one instance each. Server compilers skipped with `output: 'export'` | `nextjs/webpack.ts:353-357`, `:399` |
| When the upload runs | In each compiler's `afterEmit` hook. Staging runs in `processAssets` at `PROCESS_ASSETS_STAGE_REPORT + 1` | `plugin/webpack/index.ts:451`, `:459-469`, `:543-560` |
| Option mapping | Explicit key list in `getBuildPluginOptions` | `nextjs/getBuildPluginOptions.ts:338-381` |
| Development mode | `buildContext.dev`. The plugin has two more checks: `compiler.options.mode === 'development'` and `NODE_ENV === 'development'` | `nextjs/webpack.ts:357`; `plugin/webpack/index.ts:361`; `plugin/core/build-plugin-manager.ts:323` |

---

## Column: Next.js Turbopack and after-compile hook

"Turbopack" = Turbopack builds. "webpack+hook" = webpack with `useRunAfterProductionCompileHook: true`. Both need Next.js 15.4.1 or later, or the hook is not set up and nothing is uploaded (`nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:185-191`; `nextjs/util.ts:56-84`).

In webpack+hook the three webpack plugin instances are still added, with `sourcemaps.disable: true` forced (`nextjs/getBuildPluginOptions.ts:220-222`, `:359`; `nextjs/webpack.ts:404-412`). They still create the release, define bundle size flags, inject metadata, annotate components and run `deleteArtifacts`.

The PR changes no behaviour in this column: on develop the hook build tools got the same options, and the webpack plugins with the forced `disable: true` make no source map change in both versions.

### Matrix A

| # | Option | Value | Note | Evidence |
|---|---|---|---|---|
| 1 | `sourcemaps.disable` | Hook: default set by SDK `false`, user value passed through. webpack+hook webpack plugins: forced `true` | The SDK also reads it. Turbopack, any truthy value: no `productionBrowserSourceMaps`, no delete default. `true` only: no `turbopack.debugIds`, no CLI debug ID injection. `'disable-upload'`: debug IDs are still injected. Both values block the upload in the plugin manager. webpack+hook: truthy value skips `devtool` and the delete default | `nextjs/getBuildPluginOptions.ts:359`; `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:250`; `nextjs/turbopack/constructTurbopackConfig.ts:51-53`; `nextjs/handleRunAfterProductionCompile.ts:62`; `plugin/core/build-plugin-manager.ts:1054`; `nextjs/webpack.ts:363` |
| 2 | `sourcemaps.assets` | default set by SDK; user value replaces default | Default is a list of folders, not globs: `<dist>/server`, plus Turbopack `<dist>/static/chunks` and `<dist>/static/immutable/chunks` (each only if it exists), or webpack+hook `<dist>/static/chunks/pages` and `<dist>/static/chunks/app` (`<dist>/static/chunks` with `widenClientFileUpload`; no existence check). Each entry, user entries too, goes to the CLI as one directory; the plugin expands no globs in direct mode | `nextjs/getBuildPluginOptions.ts:97-122`, `:361`; `plugin/core/build-plugin-manager.ts:698-733` |
| 3 | `sourcemaps.ignore` | default set by SDK; user value added to default | Same defaults as the webpack column. Given to the CLI debug ID injection and to each CLI upload call | `nextjs/getBuildPluginOptions.ts:149-179`, `:263-270`, `:362`; `plugin/core/build-plugin-manager.ts:648`, `:731`; `plugin/core/cli.ts:141`, `:158` |
| 4 | `sourcemaps.filesToDeleteAfterUpload` | default set by SDK; user value replaces default | Default when `deleteSourcemapsAfterUpload` is true: `<dist>/static/**/*.js.map`, `*.mjs.map`, `*.cjs.map`, `*.css.map`. Run by `deleteArtifacts` in the hook, after the upload call, whether or not an upload ran. webpack+hook: the user value also goes to the three webpack plugins, which run it in `afterEmit`, before the hook | `nextjs/getBuildPluginOptions.ts:56`, `:185-195`, `:320-325`; `nextjs/handleRunAfterProductionCompile.ts:89`; `plugin/webpack/index.ts:572` |
| 5 | `sourcemaps.deleteSourcemapsAfterUpload` | default set by SDK in some cases; turned into something else | Mapped to the row 4 glob. Turbopack: also strips `sourceMappingURL` comments from JS and CSS in `<dist>/static` (not with `experimental.sri`) and warns about maps outside the upload folders. The plugin option of the same name is passed as `undefined` (hook) or `false` (webpack+hook webpack plugins). Default Turbopack: `true` only when the SDK itself sets `productionBrowserSourceMaps`. Default webpack+hook: `true`, written in the client webpack function; not confirmed that this write reaches the hook (see Surprises) | `nextjs/getBuildPluginOptions.ts:185-195`, `:329-336`, `:364`; `nextjs/handleRunAfterProductionCompile.ts:71-100`; `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:255-280`; `nextjs/webpack.ts:386-394` |
| 6 | `sourcemaps.rewriteSources` | never applied | Passed with the same default as the webpack column, but direct mode does not call the hook | `nextjs/getBuildPluginOptions.ts:360`; `nextjs/handleRunAfterProductionCompile.ts:66-69`; `plugin/core/build-plugin-manager.ts:698-740`, `:788` |
| 7 | `sourcemaps.resolveSourceMap` | never applied | Passed, but direct mode does not call the hook | `nextjs/getBuildPluginOptions.ts:368`; `plugin/core/build-plugin-manager.ts:698-740`, `:789` |
| 8 | `release.inject` | not in type; forced `false` | Turbopack: the SDK injects the release through a Turbopack loader rule on `instrumentation.*` (server values) and through `nextConfig.env._sentryRelease` | `nextjs/types.ts:208`; `nextjs/getBuildPluginOptions.ts:240`, `:252`; `nextjs/turbopack/generateValueInjectionRules.ts:54-56`; `nextjs/withSentryConfig/buildTime.ts:64-66` |
| 9 | `release.name`, `create`, `finalize`, `dist`, `setCommits`, `deploy` | `name`: default set by SDK. Others: passed through | Same mapping as the webpack column. Turbopack: `createRelease()` runs once, in the hook. webpack+hook: it runs in each webpack plugin's `afterEmit` and again in the hook | `nextjs/withSentryConfig/getFinalConfigObjectUtils.ts:59-64`; `nextjs/getBuildPluginOptions.ts:234-256`; `nextjs/handleRunAfterProductionCompile.ts:59`; `plugin/webpack/index.ts:555` |
| 10 | `org`, `project`, `authToken`, `sentryUrl` | passed through | As the webpack column | `nextjs/getBuildPluginOptions.ts:342-345`, `:357` |
| 11 | `bundleSizeOptimizations` | Turbopack: turned into something else. webpack+hook: as the webpack column | Turbopack: five flags become `compiler.define` values; user `compiler.define` keys win. `excludeChannelInjection` has no mapping. The object is also passed to the plugin manager in the hook, which does not use it there | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:369-391`; `nextjs/webpack.ts:874-900`; `nextjs/getBuildPluginOptions.ts:371-373`; `nextjs/handleRunAfterProductionCompile.ts:58-89` |
| 12 | `applicationKey`, `moduleMetadata` | Turbopack: `applicationKey` turned into something else; `moduleMetadata` never applied. webpack+hook: as the webpack column | Turbopack `applicationKey`: a loader rule for browser modules, only on Next.js 16 or later; no rule and no warning below 16. Turbopack `moduleMetadata`: no effect, the SDK warns. Both are passed to the plugin manager in the hook, which injects nothing | `nextjs/turbopack/constructTurbopackConfig.ts:82-104`; `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:69-78`; `nextjs/getBuildPluginOptions.ts:340-341`, `:374` |
| 13 | `debug`, `silent`, `telemetry`, `errorHandler` | passed through | No SDK default. The hook passes its own logger prefix | `nextjs/getBuildPluginOptions.ts:346-348`, `:356`; `nextjs/handleRunAfterProductionCompile.ts:53-56` |
| 14 | SDK-only options | see note | `useRunAfterProductionCompileHook` (default `true` for Turbopack, `false` for webpack): `false` on Turbopack means no hook, so no upload and no deletion, but the SDK still sets `productionBrowserSourceMaps`. `widenClientFileUpload` (default `false`): webpack+hook upload folder becomes `<dist>/static/chunks`; Turbopack folders do not change; both drop the `main-*` ignore. Next.js `productionBrowserSourceMaps`: if the user set it (any value), Turbopack gets no SDK value and no delete default. Next.js `turbopack.debugIds`: a user value is kept and decides if the SDK runs the CLI injection. Next.js `experimental.sri`: no comment stripping. Next.js `compiler.runAfterProductionCompile`: a user function runs first, then the SDK step; a non-function value means a warning and no SDK step | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:155-161`, `:185-236`, `:244-281`; `nextjs/getBuildPluginOptions.ts:100-121`, `:156-158`; `nextjs/turbopack/constructTurbopackConfig.ts:51-58`; `nextjs/handleRunAfterProductionCompile.ts:98` |
| 15 | Extra keys | no spread at the top level | Same function as the webpack column | `nextjs/getBuildPluginOptions.ts:338-381` |

### Matrix B

#### S1 Default build

| Point | Answer | Evidence |
|---|---|---|
| a | The SDK's own step runs: `handleRunAfterProductionCompile` in Next's `compiler.runAfterProductionCompile`, with `createSentryBuildPluginManager`. Turbopack: no bundler plugin. webpack+hook: the three webpack plugins also run, with `sourcemaps.disable: true` | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:193-209`; `nextjs/handleRunAfterProductionCompile.ts:46-56`; `nextjs/getBuildPluginOptions.ts:359` |
| b | Turbopack: client only, `productionBrowserSourceMaps = true`, when the user left it undefined. Nothing set for the server. webpack+hook: client `hidden-source-map`, server and edge `source-map` | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:250-264`; `nextjs/webpack.ts:371-383` |
| c | Yes. Turbopack: `turbopack.debugIds: true` when the Next.js version supports it; otherwise the hook runs the CLI `sourcemap inject` on `<dist>`, in place. webpack+hook: the webpack plugins inject none; the hook runs the CLI injection on `<dist>` | `nextjs/turbopack/constructTurbopackConfig.ts:51-58`; `nextjs/util.ts:114`; `nextjs/handleRunAfterProductionCompile.ts:62-64`; `plugin/core/build-plugin-manager.ts:643-656`; `plugin/core/cli.ts:156-162`; `plugin/webpack/index.ts:327`, `:418` |
| d | Folders handed to the CLI, one call per folder and project. Turbopack: `<dist>/server`, `<dist>/static/chunks`, `<dist>/static/immutable/chunks` (the last two only if they exist). webpack+hook: `<dist>/server`, `<dist>/static/chunks/pages`, `<dist>/static/chunks/app`. Not confirmed: whether Turbopack writes server maps by default (Next.js code) | `nextjs/getBuildPluginOptions.ts:97-122`; `nextjs/handleRunAfterProductionCompile.ts:66-69`; `plugin/core/build-plugin-manager.ts:698-740`; `plugin/core/cli.ts:129-153` |
| e | Turbopack: the SDK glob `<dist>/static/**/*.{js,mjs,cjs,css}.map` is deleted from disk by `deleteArtifacts` after the upload call. Then the SDK strips `sourceMappingURL` comments from JS and CSS in `<dist>/static`, unless `experimental.sri` is set. Maps outside `<dist>/static` (server) stay. webpack+hook: the same glob, if the delete default reaches the hook (not confirmed); no comment stripping | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:266-280`; `nextjs/getBuildPluginOptions.ts:185-195`; `nextjs/handleRunAfterProductionCompile.ts:89`, `:98-100`; `plugin/core/build-plugin-manager.ts:1009-1031` |
| f | Nothing | |

#### S2 User turned source maps on

Turbopack: `productionBrowserSourceMaps: true` (a boolean, so no separate hidden case in SDK code). webpack+hook: a truthy client `devtool`.

| Point | Answer | Evidence |
|---|---|---|
| a | As S1 | |
| b | None. Turbopack: the SDK returns when `productionBrowserSourceMaps` is not `undefined`. webpack+hook: the SDK leaves a truthy `devtool`; the webpack plugin also makes no change (visible stays visible) | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:255-257`; `nextjs/webpack.ts:371`; `plugin/core/sourcemap-settings.ts:55-58` |
| c | As S1 | |
| d | As S1 | |
| e | Turbopack: none removed and no comment stripping. The delete default is only set after the SDK itself turned the maps on. webpack+hook: as S1; the client webpack function sets the delete default whoever turned the maps on, and a visible map keeps its `sourceMappingURL` comment | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:255-280`; `nextjs/getBuildPluginOptions.ts:299`, `:325`; `nextjs/webpack.ts:386-394` |
| f | Nothing | |

#### S3 User turned source maps off

| Point | Answer | Evidence |
|---|---|---|
| a | As S1. The hook still runs | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:185-209` |
| b | Turbopack: none; `productionBrowserSourceMaps: false` is kept. webpack+hook: same as S1, because `devtool: false` is falsy and the SDK sets it | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:255-257`; `nextjs/webpack.ts:371-383` |
| c | As S1. Debug ID injection does not depend on the map setting | `nextjs/turbopack/constructTurbopackConfig.ts:51-58`; `nextjs/handleRunAfterProductionCompile.ts:62` |
| d | The CLI is called for the same folders. The plugin warns for each folder in which the CLI uploaded no files. webpack+hook: as S1 | `plugin/core/build-plugin-manager.ts:736`, `:1106-1116` |
| e | Turbopack: none; no delete default. webpack+hook: as S1 | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:255-257` |
| f | Nothing | |

#### S4 No auth token

| Point | Answer | Evidence |
|---|---|---|
| a | The hook step runs. The SDK has no token check | `nextjs/handleRunAfterProductionCompile.ts:46-69` |
| b | As S1 | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:250-264` |
| c | As S1. `injectDebugIds` has no token check. Not confirmed: whether the CLI `sourcemap inject` call needs a token | `nextjs/handleRunAfterProductionCompile.ts:62-64`; `plugin/core/build-plugin-manager.ts:643-656` |
| d | Nothing. The plugin manager warns and returns | `plugin/core/build-plugin-manager.ts:674-677`, `:1063-1065` |
| e | As S1. `deleteArtifacts` runs without an upload check, so the maps in `<dist>/static` are deleted though nothing was uploaded. Turbopack also strips the comments | `nextjs/handleRunAfterProductionCompile.ts:89`, `:98-100` |
| f | Release creation is skipped | `plugin/core/build-plugin-manager.ts:538-542` |

#### S5 `sourcemaps.disable: true`

| Point | Answer | Evidence |
|---|---|---|
| a | The hook step runs and calls `createRelease()`. webpack+hook: the webpack plugins are still added | `nextjs/handleRunAfterProductionCompile.ts:59`; `nextjs/webpack.ts:397-416` |
| b | None | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:250`; `nextjs/webpack.ts:363` |
| c | No. The SDK does not turn on `turbopack.debugIds` and skips the CLI injection. A user's own `turbopack.debugIds: true` is kept | `nextjs/turbopack/constructTurbopackConfig.ts:51-58`; `nextjs/handleRunAfterProductionCompile.ts:62` |
| d | Nothing | `plugin/core/build-plugin-manager.ts:1054-1055` |
| e | None by default; no delete default is set. With an explicit `deleteSourcemapsAfterUpload: true` the `<dist>/static` glob is deleted, and Turbopack strips the comments | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:250`; `nextjs/getBuildPluginOptions.ts:299`, `:325`; `nextjs/handleRunAfterProductionCompile.ts:89`, `:98` |
| f | Nothing else. Release creation still runs | `nextjs/handleRunAfterProductionCompile.ts:59` |

#### S6 `sourcemaps.disable: 'disable-upload'`

| Point | Answer | Evidence |
|---|---|---|
| a | As S5 | |
| b | None. The string is truthy | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:250`; `nextjs/webpack.ts:363` |
| c | Yes. The two checks test `=== true` or `!== true`, so `turbopack.debugIds` is set, or the CLI injection runs. webpack+hook: the webpack plugins get the forced `true` and inject none; the hook's CLI injection runs | `nextjs/turbopack/constructTurbopackConfig.ts:51-53`; `nextjs/handleRunAfterProductionCompile.ts:62`; `nextjs/getBuildPluginOptions.ts:359` |
| d | Nothing | `plugin/core/build-plugin-manager.ts:1054-1055` |
| e | None by default, as S5 | |
| f | Nothing | |

#### S7 User sets `filesToDeleteAfterUpload`

| Point | Answer | Evidence |
|---|---|---|
| a | As S1 | |
| b | As S1 | |
| c | As S1 | |
| d | As S1 | |
| e | The user globs replace the `<dist>/static` glob and are deleted from disk by `deleteArtifacts` in the hook. Turbopack: the comment stripping and the "not covered" warning still follow `deleteSourcemapsAfterUpload` (default `true`), not the user globs. webpack+hook: each webpack plugin also runs the user globs in its `afterEmit`, before the hook uploads | `nextjs/getBuildPluginOptions.ts:320-325`; `nextjs/handleRunAfterProductionCompile.ts:71-100`; `plugin/webpack/index.ts:572` |
| f | Nothing | |

#### S8 `deleteSourcemapsAfterUpload: true` with S2

| Point | Answer | Evidence |
|---|---|---|
| a | As S1 | |
| b | None (user-enabled) | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:255-257`; `nextjs/webpack.ts:371` |
| c | As S1 | |
| d | As S1 | |
| e | The `<dist>/static` glob is deleted from disk after the upload call. Turbopack: comments stripped unless `experimental.sri`; a warning lists maps in `<dist>/static` outside the upload folders when the user set no `assets`. webpack+hook: no switch to hidden maps and no stripping, so a visible map's `sourceMappingURL` comment stays while the map is deleted | `nextjs/getBuildPluginOptions.ts:185-195`; `nextjs/handleRunAfterProductionCompile.ts:76-100`; `plugin/core/sourcemap-settings.ts:55-58` |
| f | Nothing | |

#### S9 `deleteSourcemapsAfterUpload: false`

| Point | Answer | Evidence |
|---|---|---|
| a | As S1 | |
| b | As S1. Turbopack still gets `productionBrowserSourceMaps = true` | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:264-269`; `nextjs/webpack.ts:371-383` |
| c | As S1 | |
| d | As S1 | |
| e | None removed, no comment stripping. The client maps stay in `<dist>/static` | `nextjs/getBuildPluginOptions.ts:190-192`, `:299`; `nextjs/handleRunAfterProductionCompile.ts:71`, `:98` |
| f | Nothing | |

#### S10 Development mode

Detection: the SDK has no development check on the hook path. It sets `productionBrowserSourceMaps`, `turbopack.debugIds` and the hook on every `withSentryConfig` call. The step only runs if Next.js calls `compiler.runAfterProductionCompile`; not confirmed from this repo that Next.js never calls it in dev. If called, the plugin manager's `NODE_ENV === 'development'` check stops the upload and the release creation; `injectDebugIds` and `deleteArtifacts` have no such check. webpack+hook: the webpack side uses `buildContext.dev`.

| Point | Answer | Evidence |
|---|---|---|
| a | Not confirmed (depends on Next.js calling the hook). webpack+hook: no webpack plugin in dev | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:168-209`; `nextjs/webpack.ts:357` |
| b | Turbopack: the SDK sets `productionBrowserSourceMaps = true` without a dev check; its effect in dev is Next.js code, not confirmed. webpack+hook: none | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:244-264`; `nextjs/webpack.ts:357` |
| c | Turbopack: `turbopack.debugIds: true` is set without a dev check. CLI injection only if the hook runs | `nextjs/turbopack/constructTurbopackConfig.ts:51-58` |
| d | Nothing if `NODE_ENV === 'development'` | `plugin/core/build-plugin-manager.ts:323`, `:1060-1061` |
| e | Not confirmed (depends on the hook call) | `nextjs/handleRunAfterProductionCompile.ts:89` |
| f | Release creation is skipped if `NODE_ENV === 'development'` | `plugin/core/build-plugin-manager.ts:535-537` |

### Mechanics

| Item | Answer | Evidence |
|---|---|---|
| Plugin entry | `createSentryBuildPluginManager` from `@sentry/bundler-plugins/core`, loaded with `loadModule`; a failed load logs a warning. It calls the `sentry` CLI package. webpack+hook also uses `sentryWebpackPlugin` | `nextjs/handleRunAfterProductionCompile.ts:35-44`, `:53-56`; `plugin/core/cli.ts:1` |
| Builds | Once per build, for the whole `<dist>` folder (client, server and edge output together) | `nextjs/handleRunAfterProductionCompile.ts:46-69` |
| When the upload runs | After the build, in Next's `compiler.runAfterProductionCompile`. Order: telemetry, `createRelease`, `injectDebugIds`, `uploadSourcemaps` (direct), `deleteArtifacts`, comment stripping | `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:196-207`; `nextjs/handleRunAfterProductionCompile.ts:58-100` |
| Option mapping | Explicit key list, the same `getBuildPluginOptions` with build tool `after-production-compile-turbopack` or `-webpack` | `nextjs/handleRunAfterProductionCompile.ts:46-51`; `nextjs/getBuildPluginOptions.ts:338-381` |
| Development mode | No SDK check on the hook path; the plugin manager checks `NODE_ENV === 'development'`. Bundler detection: `TURBOPACK` env variable or `--turbo` argument | `plugin/core/build-plugin-manager.ts:323`; `nextjs/util.ts:210-221` |

---

## Column: Gatsby

Gatsby's plugin options are flat and untyped: `gatsby-node.d.ts` types them as `any` (`gatsby/gatsby-node.d.ts:1-4`), and `src/utils/types.ts` only covers the runtime `init` options. "not exposed" below means that `gatsby-node.js` does not read the key from the user's options. `gatsby-node.js` reads two keys only: `enableClientWebpackPlugin` and `deleteSourcemapsAfterUpload` (`gatsby/gatsby-node.js:8`, `:24-25`).

### Matrix A

| # | Option | Value | Note | Evidence |
|---|---|---|---|---|
| 1 | `sourcemaps.disable` | not exposed | Nearest control: `enableClientWebpackPlugin: false` removes the plugin and the `devtool` change | `gatsby/gatsby-node.js:8-9`, `:32-45` |
| 2 | `sourcemaps.assets` | not exposed | The SDK hard-codes `['./public/**']` | `gatsby/gatsby-node.js:35` |
| 3 | `sourcemaps.ignore` | not exposed | The SDK hard-codes `polyfill-*`, `framework-*`, `webpack-runtime-*`. Not confirmed: whether these relative patterns match files inside `public/`; the plugin tests `ignore` against the path relative to the working directory | `gatsby/gatsby-node.js:40-44`; `plugin/core/upload-filter.ts:26-29` |
| 4 | `sourcemaps.filesToDeleteAfterUpload` | not exposed | The SDK passes none. develop: the SDK passed `['./public/**/*.map']` when deletion was on | `gatsby/gatsby-node.js:33-45`; develop: `HEAD~1:packages/gatsby/gatsby-node.js:34` |
| 5 | `sourcemaps.deleteSourcemapsAfterUpload` | exposed as flat `deleteSourcemapsAfterUpload`; default set by SDK; turned into something else | Default: on when the SDK turned the maps on. Mapped to the plugin's `deleteSourcemapsAfterUpload: true` and `sdkEnabledSourceMaps: true`, only in stage `build-javascript`. In every other case both are `undefined`; `false` never reaches the plugin. Any truthy user value counts as `true`. develop: turned into the row 4 glob, in every stage | `gatsby/gatsby-node.js:22-27`, `:36-38`; develop: `HEAD~1:packages/gatsby/gatsby-node.js:22-24`, `:34` |
| 6 | `sourcemaps.rewriteSources` | not exposed | Plugin default hook is used | `plugin/core/build-plugin-manager.ts:788`, `:887` |
| 7 | `sourcemaps.resolveSourceMap` | not exposed | | `gatsby/gatsby-node.js:33-45` |
| 8 | `release.inject` | not exposed | Plugin default `true`: the plugin injects the release when it finds a release name | `plugin/core/options-mapping.ts:118`; `plugin/webpack/index.ts:331-344` |
| 9 | `release.name`, `create`, `finalize`, `dist`, `setCommits`, `deploy` | not exposed | Plugin defaults: name from `SENTRY_RELEASE` or automatic detection, `create: true`, `finalize: true`, `setCommits` automatic, `deploy` on Vercel | `plugin/core/options-mapping.ts:115-127`, `:141-177` |
| 10 | `org`, `project`, `authToken`, `sentryUrl` | not exposed | The plugin reads `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `SENTRY_URL` and the file `.env.sentry-build-plugin` | `plugin/core/options-mapping.ts:98-107`; `plugin/core/build-plugin-manager.ts:208-223` |
| 11 | `bundleSizeOptimizations` | not exposed | | `gatsby/gatsby-node.js:32-64` |
| 12 | `applicationKey`, `moduleMetadata` | not exposed | | `gatsby/gatsby-node.js:32-64` |
| 13 | `debug`, `silent`, `telemetry`, `errorHandler` | `debug`, `silent`, `telemetry`: not exposed (plugin defaults `false`, `false`, `true`). `errorHandler`: forced | The SDK's handler ignores errors whose message contains "organization slug is required", "project slug is required" or "authentication credentials were not provided", and throws all others | `gatsby/gatsby-node.js:48-63`; `plugin/core/options-mapping.ts:109-112` |
| 14 | SDK-only options | see note | `enableClientWebpackPlugin` (default `true`): `false` means no plugin and no `devtool` change. `deleteSourcemapsAfterUpload` (row 5) | `gatsby/gatsby-node.js:8-9`, `:22-27` |
| 15 | Extra keys | no | The user's options object is not passed to the plugin. The plugin options are a fixed literal | `gatsby/gatsby-node.js:32-64` |

### Matrix B

The plugin is added per webpack stage that Gatsby passes to `onCreateWebpackConfig`. The SDK code names one stage, `build-javascript` (`gatsby/gatsby-node.js:23`). Which other stages run with `NODE_ENV === 'production'` is Gatsby code and is not confirmed here; "other stages" below means any of them.

#### S1 Default build

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. `sentryWebpackPlugin` is added in every stage when `NODE_ENV === 'production'` and `enableClientWebpackPlugin` is not `false` | `gatsby/gatsby-node.js:8-9`, `:29-32` |
| b | `devtool: 'hidden-source-map'` in every stage whose `devtool` is not `source-map` or `hidden-source-map`. No client or server split in the SDK code | `gatsby/gatsby-node.js:10-12`, `:30` |
| c | Yes, by the plugin | `plugin/webpack/index.ts:327`, `:390-421` |
| d | `build-javascript`: staged from memory, chunks that match `./public/**` and not `ignore`. Other stages: read from disk with the glob `./public/**`. develop: read from disk in every stage | `gatsby/gatsby-node.js:35-38`; `plugin/core/sourcemap-settings.ts:129-133`; `plugin/webpack/index.ts:459-469`; `plugin/core/build-plugin-manager.ts:742-755` |
| e | `build-javascript`: the plugin removes all maps of that compilation before write (CSS maps and maps of chunks left out of the upload included). Other stages: nothing removed. develop: `./public/**/*.map` deleted from disk after the upload by `deleteArtifacts`, in every stage | `plugin/webpack/index.ts:257-298`, `:446`; `gatsby/gatsby-node.js:22-27`; develop: `HEAD~1:packages/gatsby/gatsby-node.js:34` |
| f | Nothing. Plugin release injection and release creation are on (plugin defaults) | `plugin/core/options-mapping.ts:118-120` |

#### S2 User turned source maps on (`source-map` or `hidden-source-map`)

| Point | Answer | Evidence |
|---|---|---|
| a | Yes | `gatsby/gatsby-node.js:9`, `:32` |
| b | None; the user's `devtool` is kept. Visible and hidden behave the same. Any other value (for example `inline-source-map`, `eval-source-map`) is replaced with `hidden-source-map` | `gatsby/gatsby-node.js:11-12`, `:30` |
| c | Yes | `plugin/webpack/index.ts:418-421` |
| d | Read from disk in every stage, glob `./public/**` | `plugin/core/sourcemap-settings.ts:129-138`; `plugin/core/build-plugin-manager.ts:742-755` |
| e | None removed. The delete default applies only when the SDK turned the maps on | `gatsby/gatsby-node.js:22-27` |
| f | Nothing | |

#### S3 User turned source maps off (`devtool: false`)

| Point | Answer | Evidence |
|---|---|---|
| a-f | Same as S1. `false` is not `source-map` or `hidden-source-map`, so the SDK sets `hidden-source-map` | `gatsby/gatsby-node.js:11-12`, `:30` |

#### S4 No auth token

| Point | Answer | Evidence |
|---|---|---|
| a | Yes. No token check in `gatsby-node.js` | `gatsby/gatsby-node.js:9` |
| b | As S1 | `gatsby/gatsby-node.js:10-12`, `:30` |
| c | Yes | `plugin/webpack/index.ts:327`, `:418` |
| d | Nothing. The plugin warns and returns | `plugin/core/build-plugin-manager.ts:674-677`, `:1063-1065` |
| e | `build-javascript`: all maps removed before write without an upload, with a warning. Other stages: maps stay. develop: `./public/**/*.map` deleted from disk in every stage; `deleteArtifacts` runs in `finally` | `plugin/webpack/index.ts:453-458`, `:570-573`; `plugin/core/sourcemap-settings.ts:55-80` |
| f | Release creation is skipped. Release injection stays on | `plugin/core/build-plugin-manager.ts:538-542`; `plugin/webpack/index.ts:331-344` |

#### S5 `sourcemaps.disable: true`

| Point | Answer | Evidence |
|---|---|---|
| a-f | Not exposed. `gatsby-node.js` reads no `sourcemaps` or `disable` key, so the build is S1. `enableClientWebpackPlugin: false` removes the plugin and with it debug IDs, upload, deletion, the `devtool` change, release injection and release creation | `gatsby/gatsby-node.js:8-9`, `:32-64` |

#### S6 `sourcemaps.disable: 'disable-upload'`

| Point | Answer | Evidence |
|---|---|---|
| a-f | Not exposed. Same as S5 | `gatsby/gatsby-node.js:8-9`, `:32-64` |

#### S7 User sets `filesToDeleteAfterUpload`

| Point | Answer | Evidence |
|---|---|---|
| a-f | Not exposed. The key is not read, so the build is S1 | `gatsby/gatsby-node.js:33-45` |

#### S8 `deleteSourcemapsAfterUpload: true` with S2

| Point | Answer | Evidence |
|---|---|---|
| a | Yes | `gatsby/gatsby-node.js:9`, `:32` |
| b | None by the SDK. `build-javascript` with a visible `devtool`: the plugin changes it to `hidden-source-map`. Other stages: no change | `gatsby/gatsby-node.js:30`; `plugin/webpack/index.ts:368-370`; `plugin/core/sourcemap-settings.ts:135-149` |
| c | Yes | `plugin/webpack/index.ts:418-421` |
| d | `build-javascript`: staged from memory. Other stages: read from disk. develop: read from disk in every stage | `plugin/webpack/index.ts:459-469`; `gatsby/gatsby-node.js:22-27` |
| e | `build-javascript`: all maps removed before write, though the user turned them on (`sdkEnabledSourceMaps` is set to the same `true`). Other stages: maps stay. develop: `./public/**/*.map` deleted from disk in every stage; `devtool` not changed, so a visible map's comment stays | `gatsby/gatsby-node.js:36-38`; `plugin/core/sourcemap-settings.ts:133`, `:139-142`; develop: `HEAD~1:packages/gatsby/gatsby-node.js:22-34` |
| f | Nothing | |

#### S9 `deleteSourcemapsAfterUpload: false`

| Point | Answer | Evidence |
|---|---|---|
| a | Yes | `gatsby/gatsby-node.js:9`, `:32` |
| b | As S1. The SDK still sets `hidden-source-map` | `gatsby/gatsby-node.js:10-12`, `:30` |
| c | Yes | `plugin/webpack/index.ts:418-421` |
| d | Read from disk in every stage | `plugin/core/sourcemap-settings.ts:129-131` |
| e | None removed. The plugin gets `undefined`, not `false`; the result is the same because `devtool` is always set. The maps stay in `public/` | `gatsby/gatsby-node.js:22-27` |
| f | Nothing | |

#### S10 Development mode

Detection: `process.env.NODE_ENV === 'production'` must hold, or the plugin block is skipped (`gatsby/gatsby-node.js:9`).

| Point | Answer | Evidence |
|---|---|---|
| a | No plugin | `gatsby/gatsby-node.js:9` |
| b | None | `gatsby/gatsby-node.js:9`, `:29-30` |
| c | No | |
| d | Nothing | |
| e | None | |
| f | Plugin release injection is off too (no plugin). The SDK config file is still added to the webpack entries | `gatsby/gatsby-node.js:69-88` |

### Mechanics

| Item | Answer | Evidence |
|---|---|---|
| Plugin entry | `sentryWebpackPlugin` from `@sentry/bundler-plugins/webpack`, a static `require` | `gatsby/gatsby-node.js:3` |
| Builds | Every webpack stage that Gatsby passes to `onCreateWebpackConfig`, when `NODE_ENV === 'production'`. No stage filter for the plugin; only the deletion is limited to `build-javascript` | `gatsby/gatsby-node.js:7-9`, `:23` |
| When the upload runs | In the plugin's `afterEmit` hook of each stage's compiler | `plugin/webpack/index.ts:543-560` |
| Option mapping | A fixed literal. Two user keys are read; no other user value reaches the plugin | `gatsby/gatsby-node.js:8`, `:22-27`, `:32-64` |
| Development mode | `process.env.NODE_ENV === 'production'` check in the SDK. The plugin adds its own `compiler.options.mode` and `NODE_ENV` checks | `gatsby/gatsby-node.js:9`; `plugin/webpack/index.ts:361`; `plugin/core/build-plugin-manager.ts:323` |

---

## Surprises

Facts only. Each item names the code that decides it.

1. Next.js webpack: turning source maps off does nothing. The SDK tests `!newConfig.devtool`, so `devtool: false` is replaced with `hidden-source-map` (client) or `source-map` (server, edge). Gatsby does the same for every `devtool` other than `source-map` and `hidden-source-map`. Turbopack keeps `productionBrowserSourceMaps: false`. (`nextjs/webpack.ts:371-383`; `gatsby/gatsby-node.js:11-12`, `:30`; `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:255-257`)
2. User-enabled client maps: Next.js webpack removes them by default (the delete default is set whoever turned the maps on, and `sdkEnabledSourceMaps` is always the same boolean). Turbopack keeps them by default (the delete default is only set after the SDK turned the maps on). Gatsby keeps them by default. (`nextjs/webpack.ts:386-394`; `nextjs/getBuildPluginOptions.ts:365-367`; `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:255-280`; `gatsby/gatsby-node.js:22-27`)
3. Maps are deleted without an upload in all three columns when no auth token is set: Next.js webpack and Gatsby through the plugin's no-upload branch, the hook path because `deleteArtifacts` runs with no upload check. (`plugin/webpack/index.ts:453-458`; `nextjs/handleRunAfterProductionCompile.ts:66-89`)
4. `rewriteSources` and `resolveSourceMap` are in the Next.js type and are passed on, but the hook path (all Turbopack builds) never calls them. `resolveSourceMap` is also not called for the Next.js webpack client on the staged route, which is the default. (`plugin/core/build-plugin-manager.ts:698-740`, `:788-789`, `:925-930`)
5. JSDoc and code disagree on `rewriteSources`: the inherited JSDoc says the default makes sources relative to `process.cwd()`; the Next.js default removes the `webpack://` prefix. (`core-types:284`; `nextjs/getBuildPluginOptions.ts:227-229`, `:360`)
6. JSDoc and code disagree on `assets` for the hook path: the JSDoc says globs; in direct mode each entry goes to the CLI as a directory. (`core-types:227`; `plugin/core/build-plugin-manager.ts:702-733`)
7. JSDoc and code disagree on `useRunAfterProductionCompileHook`: the JSDoc says Next.js 15 or later; the code needs 15.4.1 or later. (`nextjs/types.ts:377`; `nextjs/util.ts:56-84`)
8. Turbopack with `useRunAfterProductionCompileHook: false`, or with a non-function `compiler.runAfterProductionCompile`: the SDK still sets `productionBrowserSourceMaps = true`, and no step uploads or deletes the maps. (`nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:185-187`, `:234-236`, `:244-264`)
9. webpack+hook: the three webpack plugins stay active with a forced `sourcemaps.disable: true`. Each calls `createRelease()` (the hook calls it again), and each runs a user `filesToDeleteAfterUpload` glob in `afterEmit`, before the hook uploads. (`nextjs/getBuildPluginOptions.ts:359`, `:320-325`; `plugin/webpack/index.ts:555`, `:572`)
10. Not confirmed, webpack+hook: the `deleteSourcemapsAfterUpload: true` default is written inside the client webpack function. The hook reads the same options object later. Whether it sees the write depends on whether Next.js runs the webpack function in the process that calls the hook. (`nextjs/webpack.ts:386-394`; `nextjs/handleRunAfterProductionCompile.ts:71`)
11. Turbopack with a user `filesToDeleteAfterUpload`: the `sourceMappingURL` comment stripping still follows `deleteSourcemapsAfterUpload`, so comments are removed from all JS and CSS in `<dist>/static` even if the user globs leave those maps in place. (`nextjs/handleRunAfterProductionCompile.ts:71`, `:98-100`)
12. `sourcemaps.disable: 'disable-upload'` in Next.js: the SDK turns no maps on (the string is truthy), so debug IDs are injected into JS only, unless the user turns maps on. `disable: true` and `'disable-upload'` differ only in the debug ID step. (`nextjs/webpack.ts:363`; `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:250`; `nextjs/handleRunAfterProductionCompile.ts:62`)
13. Next.js `release.create: false` with no `release.name`: the SDK passes only `inject`, `create`, `finalize` (all `false`). The plugin then looks for a release name itself (`SENTRY_RELEASE` or automatic detection). When it finds one, `createRelease()` still runs the default `setCommits` and, on Vercel, `deploy`. (`nextjs/getBuildPluginOptions.ts:251-255`; `plugin/core/options-mapping.ts:117`, `:141-177`; `plugin/core/build-plugin-manager.ts:594-626`)
14. Turbopack: `bundleSizeOptimizations.excludeChannelInjection` has no mapping to `compiler.define`; `applicationKey` adds no rule and logs no warning below Next.js 16; `moduleMetadata` has no effect (with a warning). (`nextjs/webpack.ts:874-900`; `nextjs/turbopack/constructTurbopackConfig.ts:82-83`; `nextjs/withSentryConfig/getFinalConfigObjectBundlerUtils.ts:69-78`)
15. Gatsby: the log line "Those source maps will be deleted after they were uploaded to Sentry" prints in every stage and also with `deleteSourcemapsAfterUpload: false`; the code deletes only in `build-javascript` and not with `false`. (`gatsby/gatsby-node.js:14-27`)
16. Gatsby exposes no Sentry build option other than `enableClientWebpackPlugin` and `deleteSourcemapsAfterUpload`. Org, project, token, URL and release come from environment variables only. The SDK's `errorHandler` matches errors by message text. (`gatsby/gatsby-node.js:32-64`)
17. Gatsby: every stage's plugin instance globs `./public/**` from disk, also stages that do not write to `public/`. Not confirmed what those instances find, because the stage order and output folders are Gatsby code. (`gatsby/gatsby-node.js:35`; `plugin/core/build-plugin-manager.ts:742-755`)

## Not confirmed

- Which `devtool` Next.js sets for `productionBrowserSourceMaps` and `experimental.serverSourceMaps` under webpack (Next.js code). Looked at `nextjs/webpack.ts:364-383`; only a code comment names the Next.js default.
- Whether Turbopack writes server source maps by default, and what `productionBrowserSourceMaps` does in Turbopack dev (Next.js code).
- Whether Next.js calls `compiler.runAfterProductionCompile` in dev (Next.js code). The SDK path has no dev check.
- webpack+hook delete default reaching the hook (Surprises 10).
- Whether the CLI `sourcemap inject` call needs an auth token (`sentry` package code, in `node_modules`).
- Whether a glob in a user `assets` entry works on the hook path, where the entry is sent to the CLI as a directory (`sentry` package code).
- Gatsby: whether the relative `ignore` patterns match files inside `public/` (`glob` package behaviour), and which stages other than `build-javascript` run with `NODE_ENV === 'production'` (Gatsby code).
