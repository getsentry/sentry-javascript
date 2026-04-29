# Changelog

## 5.2.1

### Bug Fixes 🐛

- (webpack) Await source map deletion before signaling build completion by @andreiborza in [#918](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/918)

### Internal Changes 🔧

- (ci) Disable changelog preview by @chargome in [#917](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/917)
- Add additional integration tests by @timfish in [#914](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/914)
- Remove unused e2e tests by @timfish in [#915](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/915)

## 5.2.0

### New Features ✨

- (core) Pass `mapDir` to `rewriteSourcesHook` by @chargome in [#908](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/908)
- Use `crypto.randomUUID` rather than `uuid` by @timfish in [#892](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/892)

### Bug Fixes 🐛

- (core) Conditionally add tracing headers by @chargome in [#907](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/907)
- (e2e-tests) Pin axios to 1.13.5 to avoid compromised 1.14.1 by @andreiborza in [#906](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/906)
- (rollup) Make rollup an optional peer dependency by @andreiborza in [#913](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/913)
- Add missing webpack5 entrypoint in webpack-plugin by @brunodccarvalho in [#905](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/905)

### Internal Changes 🔧

- (deps) Bump vulnerable webpack version by @chargome in [#909](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/909)
- (tests) Use deterministic debugids by @chargome in [#912](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/912)
- Add esbuild integration tests by @timfish in [#911](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/911)
- Vite integration tests by @timfish in [#899](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/899)
- Webpack integration tests by @timfish in [#904](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/904)
- Isolate integration test package installs by @timfish in [#902](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/902)
- Pin GitHub Actions to full-length commit SHAs by @joshuarli in [#900](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/900)
- Rollup integration tests by @timfish in [#897](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/897)
- New integration tests by @timfish in [#896](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/896)
- Remove lerna by @timfish in [#895](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/895)
- Migrate to Vitest by @timfish in [#894](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/894)

## 5.1.1

### Bug Fixes 🐛

- Align `engines` with Node support by @timfish in [#893](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/893)

### Internal Changes 🔧

- Use version range for magic-string by @JPeer264 in [#891](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/891)

## 5.1.0

### New Features ✨

- Bump @sentry/cli from 2.57.0 to 2.58.5 by @andreiborza in [#890](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/890)

## 5.0.0

### Breaking Changes 🛠

- Updating minimatch by @isaacs in [#885](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/885)
- Remove support for Node < v18 and webpack v4 by @timfish in [#886](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/886)

### Bug Fixes 🐛

- (webpack) Deduplicate webpack deploys by @chargome in [#875](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/875)

### Internal Changes 🔧

- Avoid direct usage of glob, extract into `globFiles` helper by @andreiborza in [#883](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/883)
- Migrate to oxfmt by @timfish in [#880](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/880)
- Build with Rolldown by @timfish in [#872](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/872)
- Remove unplugin by @timfish in [#876](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/876)
- Rollup/Vite no longer uses unplugin by @timfish in [#858](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/858)
- Esbuild no longer uses unplugin by @timfish in [#871](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/871)
- Webpack no longer uses unplugin by @timfish in [#870](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/870)

## 4.9.1

### New Features ✨

- Track major version for Vite and Rollup by @timfish in [#867](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/867)

### Internal Changes 🔧

- Bump craft for release workflow by @chargome in [#859](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/859)

## 4.9.0

### New Features ✨

- (telemetry) Add `bundler-major-version` tag to webpack by @chargome in [#857](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/857)

## 4.8.0

### New Features ✨

- Inject component annotations into HTML elements rather than React components by @timfish in [#851](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/851)
- Combine injection snippets by @timfish in [#853](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/853)
- Use Rolldown native `MagicString` by @timfish in [#846](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/846)

## 4.7.0

- docs: Add RELEASE.md to document release process ([#834](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/834))
- feat: Combine injection plugins ([#844](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/844))
- fix(plugin-manager): Enable "rejectOnError" in debug ([#837](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/837))
- fix(plugin-manager): Respect `sourcemap.ignore` values for injecting debugIDs ([#836](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/836))
- fix(vite): Skip HTML injection for MPA but keep it for SPA ([#843](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/843))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore: Use pull_request_target for changelog preview ([#842](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/842))
- ci(release): Switch from action-prepare-release to Craft ([#831](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/831))
- test: Ensure Debug IDs match ([#840](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/840))
</details>

## 4.6.2

- fix(vite): Ensure sentryVitePlugin always returns an array of plugins ([#832](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/832))
- fix(vite): Skip code injection for HTML facade chunks ([#830](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/830))
- fix(rollup): Prevent double-injection of debug ID ([#827](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/827))
- fix(esbuild): fix debug ID injection when moduleMetadata or applicationKey is set ([#828](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/828))

## 4.6.1

- chore(deps): Update glob to 10.5.0 ([#823](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/823))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore(core): Log release output ([#821](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/821))
</details>

## 4.6.0

- fix(core): Stop awaiting build start telemetry to avoid breaking module federation builds ([#818](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/818))
- feat(core): Bump @sentry/cli from 2.51.0 to 2.57.0 ([#819](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/819))

## 4.5.0

- docs: added info on debug flag value precedence ([#811](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/811))
- feat: add debug statements after sourcemap uploads ([#812](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/812))
- feat(core): Allow multi-project sourcemaps upload ([#813](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/813))
- fix: propagate the debug option to the cli ([#810](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/810))

## 4.4.0

- feat(core): Explicitly allow `undefined` as value for `authToken` option ([#805](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/805))
- fix(core): Strip query strings from asset paths ([#806](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/806))

Work in this release was contributed by @aiktb. Thank you for your contribution!

## 4.3.0

- feat(core): Extend deploy option to allow opting out of automatic deploy creation ([#801](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/801))
- feat(core): No asset globbing for direct upload ([#800](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/800))

## 4.2.0

- feat(core): Add `prepareArtifacts` option for uploading sourcemaps ([#794](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/794))
- perf: use premove for build clean ([#792](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/792))
- fix(core): Forward headers option to sentry-cli ([#797](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/797))

Work in this release contributed by @liAmirali. Thank you for your contribution!

## 4.1.1

- fix(react-native): Enhance fragment detection for indirect references ([#767](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/767))

## 4.1.0

- feat(deps): Bump @sentry/cli to 2.51.0 [#786](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/786)
- feat(core): Add flag for disabling sourcemaps upload [#785](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/785)
- fix(debugId): Add guards for injected code to avoid errors [#783](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/783)
- docs(options): Improve JSDoc for options [#781](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/781)
- feat(core): Expose method for injecting debug Ids from plugin manager [#784](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/784)

## 4.0.2

- fix(core): Make `moduleMetadata` injection snippet ES5-compliant ([#774](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/774))

## 4.0.1

- fix(core): Make plugin inject ES5-friendly code ([#770](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/770))
- fix(core): Use `renderChunk` for release injection for Rollup/Rolldown/Vite ([#761](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/761))

Work in this release was contributed by @grushetsky. Thank you for your contribution!

## 4.0.0

### Breaking Changes

- (Type change) Vite plugin now returns `VitePlugin` type instead of `any`
- Deprecated function `getBuildInformation` has been removed

### List of Changes

- feat(core)!: Remove `getBuildInformation` export ([#765](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/765))
- feat(vite)!: Update return type of vite plugin ([#728](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/728))

## 3.6.1

- fix(core): Observe and handle Sentry CLI sourcemap upload failures ([#763](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/763))

## 3.6.0

- feat(core): Don't add `debugIdUploadPlugin` when sourcemaps option is disabled ([#753](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/753))
- fix(core): Avoid showing success message if upload was disabled or nothing was uploaded ([#757](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/757))

## 3.5.0

- feat(core): Add hook to customize source map file resolution ([#732](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/732))
- fix(core): Avoid console output and telemetry init when plugins are disabled ([#741](https://github.com/getsentry/sentry-javascript-bundler-plugins/pull/741))

Work in this release was contributed by @thecodewarrior. Thank you for your contribution!

## 3.4.0

- fix: Replace existing debug ID comments (#730)
- feat: Expose bundler plugin primitives via `createSentryBuildPluginManager` (#714)

## 3.3.1

- fix(webpack5): All `esm` files must have `.mjs` postfix (#721)

## 3.3.0

- feat(webpack): Add `@sentry/webpack-plugin/webpack5` export for webpack 5.1+ and compatible environments (#715)
- feat: Only do automatic commit association for Vercel production environments (#711)

## 3.2.4

- Revert "feat(core): Use path instead of debug IDs as artifact names for debug ID upload (#700)" (#709)
- ref: Remove deprecated use of `useArtifacBundles` (#707)

## 3.2.3

- feat(core): Use path instead of debug IDs as artifact names for debug ID upload (#700)
- feat(webpack): Primarily use `contentHash` for debug ID hash (#702)
- feat: Detect Vercel commits and env (#694)
- feat: Default to automatically setting commits on release (#692)

## 3.2.2

- feat(annotation): Handle JSX member expressions (#690)
- fix(core): Don't crash on recoverable CLI command error (#682)
- chore: Suggest putting `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` in `passThroughEnv` when using Turborepo (#675)

## 3.2.1

- deps: Bump @sentry/cli to 2.42.2 (#685)

## 3.2.0

- feat(core): Accept and await a promise in `sourcemaps.filesToDeleteAfterUpload` (#677)

## 3.1.2

- deps: Bump `@sentry/cli` to `2.41.1` (#671)

## 3.1.1

- fix(core): Disable release creation and source maps upload in dev mode (#666)

  This fix disables any external calls to the Sentry API for managing releases or uploading source maps, when detecting that the plugin is running in dev-mode. While this rarely actually happened,
  it also polluted the dev server output with unnecessary logs about missing auth tokens, which shouldn't
  be required in dev mode.

## 3.1.0

- feat(webpack): Gate forced process exit behind experimental flag (#663)

## 3.0.0

### Breaking Changes

- Injected code will now use `let`, which was added in ES6 (ES2015).
  This means that ES6 is the minimum JavaScript version that the Sentry bundler plugins support.

- Deprecated options have been removed:
  - `deleteFilesAfterUpload` - Use `filesToDeleteAfterUpload` instead
  - `bundleSizeOptimizations.excludePerformanceMonitoring` - Use `bundleSizeOptimizations.excludeTracing` instead
  - `_experiments.moduleMetadata` - Use `moduleMetadata` instead
  - `cleanArtifacts` - Did not do anything

### List of Changes

- fix!: Wrap injected code in block-statement to contain scope (#646)
- chore!: Remove deprecated options (#654)
- feat(logger): Use console methods respective to log level (#652)
- fix(webpack): Ensure process exits when done (#653)
- fix: Use correct replacement matcher for `bundleSizeOptimizations.excludeTracing` (#644)

Work in this release contributed by @jdelStrother. Thank you for your contribution!

## 2.23.1

- fix(v2/core): Make `moduleMetadata` injection code ES5-compliant (#773)

## 2.23.0

- chore(deps): bump nanoid from 3.3.6 to 3.3.8 (#641)
- feat(core): Detect Railway release name (#639)
- feat(core): Write module injections to `globalThis` (#636)
- feat(react-component-annotate): Allow skipping annotations on specified components (#617)
- ref(core): Rename release management plugin name (#647)

Work in this release contributed by @conor-ob. Thank you for your contribution!

## 2.22.7

- deps: Bump `@sentry/cli` to `2.39.1` and require specific version (#632)
- feat(telemetry): Record if plugin is run in CI (#627)

## 2.22.6

- fix(core): Use sha256 instead of md5 to generate uuids from string (#619)

## 2.22.5

- fix: Ignore stderr output from git command (#613)
- feat: Update Sentry telemetry to v8 (#604)
- deps: Update `@sentry/cli` to `2.36.1` (#609)

## 2.22.4

- feat(react-component-annotate): Handle function body returning a ternary (#598)
- fix: Allow injection plugins to apply to files with query parameters and fragments in their name (#597)

Work in this release contributed by @Thristhart. Thank you for your contribution!

## 2.22.3

- fix(core): Always instantiate global `Error` class in injected code snippets (#594)

## 2.22.2

- fix: Disable debug ID injection when `sourcemaps.disable` is set (#589)

## 2.22.1

- fix: Use `sourcemaps.disable` to disable debug ID upload instead of legacy upload (#587)
- fix: Escape release string in injection snippet (#585)

## 2.22.0

- deps: Bump `@sentry/cli` to `2.33.1` (#581)
- feat: Add `bundleSizeOptimizations.excludeTracing` option as alias to deprecated `bundleSizeOptimizations.excludePerformanceMonitoring` (#582)
- fix(vite-plugin): Ensure `post` order of `sentry-vite-release-injection-plugin` to avoid breaking `@rollup/plugin-commonjs` step (#578)

## 2.21.1

- fix: Do not delete files before all upload tasks executed (#572)

Work in this release contributed by @tyouzu1. Thank you for your contribution!

## 2.21.0

- fix: Use `sequential` and `post` order for vite artifact deletion (#568)
- feat: Add option to disable sourcemaps (#561)

Work in this release contributed by @tyouzu1. Thank you for your contribution!

## 2.20.1

- feat(telemetry): Collect whether applicationKey is set (#559)
- fix: Wait for tasks depending on sourcemaps before deleting (#557)

## 2.20.0

- feat: Export esbuild plugin as default (#555)

## 2.19.0

- feat: Don't use word "error" in log message about telemetry (#548)
- feat(core): Detect releases from more providers (#549)
- fix: Always delete files when `sourcemaps.filesToDeleteAfterUpload` is set (#547)
- fix(vite): Fix environment variable loading issue for Windows (#545)

Work in this release contributed by @Rassilion, and @mateusz-daniluk-xtb. Thank you for your contributions!

## 2.18.0

- feat: Add `applicationKey` option to identify application code from within the SDK (#540)
- feat: Allow passing of meta-framework as telemetry data (#539)
- feat: Promote experimental `moduleMetadata` option to stable (#538)
- fix(esbuild): Invert warning about `bundle: true` (#542)

## 2.17.0

- feat: Deprecate and noop `cleanArtifacts` (#525)
- feat: Support Heroku env vars when inferring release name (#517)
- fix(docs): Update pnpm install commands (#516)
- misc(esbuild): Log warning when attempting to inject debug IDs with esbuild `bundle` option active (#526)

Work in this release contributed by @et84121, and @duailibe. Thank you for your contributions!

## 2.16.1

- fix: Create word-based fidelity source mapping for code transformations (#513)
- fix: Also match `.cjs` and `.mjs` files when finding files to upload in rollup-based bundlers (#509)

## 2.16.0

- feat(core): Add `loggerPrefixOverride` meta option (#506)

## 2.15.0

- feat: Make options argument optional (#502)
- ref(annotate): Turn disabled message to debug log (#504)

## 2.14.3

- deps(core): Unpin `@babel/core`, `find-up`, and `glob` (#496)

Work in this release contributed by @allanlewis. Thank you for your contribution!

## 2.14.2

- feat(core): Bundle in Sentry SDK deps (#487)

## 2.14.1

- fix(core): Stop .env files from being picked up (#486)
- feat(core): Add telemetry for React component annotations (#482)

## 2.14.0

- ref(component-annotate): Use default export (#478)

## 2.13.0

- ref(component-annotate): Conform to Babel plugin naming conventions

## 2.12.0

- ref(component-annotate): Prefix plugin name with `babel`

## 2.11.0

- feat(core): Include component name annotation plugin with all bundler plugins except esbuild (#469)
- feat(component-annotate): Introduce new plugin to annotate frontend components at build-time (#468)

## 2.10.3

- fix(core): Safely flush telemetry

## 2.10.2

- deps(core): Bump `@sentry/cli` to `^2.22.3` (#451)

## 2.10.1

- chore: bump @sentry/cli dependency to 2.21.4 (#440)

## 2.10.0

- feat: deprecate `excludeReplayCanvas` config (#436)
- feat: Add `excludeReplayWorker` to `bundleSizeOptimizations` (#433)

## 2.9.0

- feat: Allow to configure `bundleSizeOptimizations` (#428)
- fix(core): Don't abort source map location guessing when the reference is a URL (#424)
- fix(core): Widen detection of source maps with `.cjs.map` and `.mjs.map` (#422)

## 2.8.0

- build(core): Bump Sentry CLI to v2.21.2 (#415)
- feat: Detect release name for Bitbucket pipelines (#404)
- feat: Detect release name for Flightcontrol (#411)
- fix(core): Move git revision to a separate function (#399)
- fix(esbuild): Don't inject debug IDs into injected modules (#417)

Work in this release contributed by @hoslmelq, @mjomble, and @aquacash5. Thank you for your contributions!

## 2.7.1

- docs: Point to org auth token page (#393)
- fix(webpack): Add `default` fallback to webpack import (#395)
- fix: Save results of `rewriteSourcesHook` (#390)

Work in this release contributed by @adonskoy. Thank you for your contribution!

## 2.7.0

- feat: Add module metadata injection for esbuild (#381)
- feat: Add module metadata injection for vite and rollup (#380)
- ref: Emit high resolution source-maps with `magic-string` (#383)
- ref: Run upload preparation with maximum concurrency (#379)

## 2.6.2

- fix: Fix regex in source map locating heuristic via `sourceMappingURL` (#376)
- fix: Make sourceMappingURL heuristic more resilient (#378)

Thanks to @tomyam1 for identifying and pinpointing a bug that was hard to spot!

## 2.6.1

- fix: Don't crash on failed delete after upload (#373)

## 2.6.0

- deps: Bump sentry-cli to 2.20.1 (#355)
- feat: Allow ommiting `org` when using organization auth token (#368)
- ref: Make asset detection more robust (#369)

## 2.5.0

- deps: Bump and unpin Sentry SDK deps (#353)
- docs: Remove misleading documentation (#339)
- feat: Add experimental module metadata injection (#334)
- fix: Fix 'identifiy' typo in log messages (#341)

Work in this release contributed by @chunfeilung. Thank you for your contribution!

## 2.4.0

- docs: Update instructions to install Vite plugin via pnpm (#331)
- docs: Update minimum supported Node.js version to 14 (#327)
- feat: Add configuration via `.env.sentry-build-plugin` file (#333)
- ref: Use full git SHA for release name (#330)

Work in this release contributed by @ffxsam and @emilsivervik. Thank you for your contributions!

## 2.3.0

- feat(webpack): Generate deterministic debug IDs (#321)
- feat: Add `filesToDeleteAfterUpload` alias for `deleteFilesAfterUpload` (#313)
- feat: Sort globbed files to ensure deterministic bundle IDs (#318)
- fix(esbuild): Don't override user code with proxy module (#322)
- fix(esbuild): Fix debug ID generation (#325)
- fix: Use `SENTRY_RELEASE` environment variable to set `release.name` option (#317)

Work in this release contributed by @smbroadley. Thank you for your contribution!

## 2.2.2

- fix(esbuild): Don't use namespace for esbuild proxy resolving (#311)
- fix: Update commentUseStrictRegex to be lazy instead of greedy (#309)

Work in this release contributed by @jdk2pq. Thank you for your contribution!

## 2.2.1

- fix(esbuild): Inject different debug IDs into different output bundles (#301)
- fix(webpack): Set minimum webpack 4 peer dep to `4.40.0` (#290)
- fix: Use magic-string `appendLeft` instead of `replace` (#303)
- ref: Improve log message when sourcemap cannot be found (#287)

## 2.2.0

- ref(core): Make better use of Sentry (#246)
- ref(webpack): Use webpack peer dependency (#273)

Work in this release was made possible with help from @wojtekmaj and @dobladov. Thank you for your contributions!

## 2.1.0

- docs: Add removal of `configFile` option to migration guide (#266)
- feat: Auto detect build artifacts (#257)
- fix(core): Ignore query and hash in filepaths for release injection (#272)
- fix(esbuild): Use absolute path for virtual file resolving (#269)
- fix: Don't show log message if telemetry is disabled (#267)
- fix: Use automatic release name detection for release injection (#271)

## 2.0.0

Version 2.0.0 marks the official release of the `@sentry/vite-plugin`, `@sentry/esbuild-plugin` and `@sentry/rollup-plugin` packages.
They are now considered stable.

For the `@sentry/webpack-plugin` this is a major release with breaking changes.
Please refer to the [migration guide](https://github.com/getsentry/sentry-javascript-bundler-plugins/blob/main/MIGRATION.md) for instructions on how to upgrade.

- feat(core): Add `deleteFilesAfterUpload` option (#244)
- feat(core): Implements rewrite sources for debug ID upload (#243)
- fix(core): Account for undefined release name values (#251)
- fix(webpack): Inject different debug IDs for different bundles (#242)
- ref(core): Add new options type for future use (#216)
- ref(core): Extract debug ID injection into separate plugins (#230)
- ref(core): Extract debug ID sourcemap upload into a separate plugin (#231)
- ref(core): Extract release injection into separate plugins (#218)
- ref(core): Extract release management into a separate plugin (#232)
- ref(core): Extract telemetry into a separate plugin (#234)
- ref(core): Switch to v2 options (#237)
- ref(core): Use debug ID as filename for upload (#247)
- ref(core): Use factory function to create individual plugins (#229)
- ref: Remove `injectReleasesMap` option (#236)

## 0.7.2

- fix(core): Use createRequire to not use built-in require in ESM (#212)

## 0.7.1

- fix(core): Fix vite complaining about CJS import of webpack-sources (#210)

## 0.7.0

This release introduces the `sourcemaps` option. This option switches to a new system of handling source maps in Sentry.

While the old system is still available via the `include` option, the recommended way forward is the `sourcemaps` option.

You can configure the `sourcemaps` option as follows:

```js
plugin({
  org: "Your organization",
  project: "Your project",
  authToken: "Your auth token",

  sourcemaps: {
    // Specify the directory containing build artifacts
    assets: "./dist/**",
  },
});
```

- feat(esbuild): Add debug ID injection for esbuild (#202)
- feat: Promote debug ID uploading to stable via `sourcemaps` option (#204)
- fix(core): Also do debug ID injection for `.cjs` files (#203)
- fix: Add typing exports to packages (#208)

## 0.6.1

- ref: Run upload preparation with maximum concurrency (#382)

## 0.6.0

- feat(webpack): Add debug ID injection to the webpack plugin (#198)
- fix(core): Don't exclude release injection module (#200)
- ref(core): Don't interact with Sentry in watch-mode (#199)

Work in this release contributed by @hakubo. Thank you for your contribution!

## 0.5.1

- fix(core): Skip all transformations for 3rd party modules

## 0.5.0

- feat(core): Add `injectRelease` and `uploadSourceMaps` options (#190)
- feat(core): Add experimental debug ID based source map upload to Rollup and Vite plugins (#192)
- feat(core): Import release injection code from each module (#188)
- feat: Add `_experiments.injectBuildInformation` option (#176)
- feat: Add `sentryCliBinaryExists` function (#171)

Work in this release contributed by @alexandresoro and @dcyou. Thank you for your contributions!

## 0.4.0

This release contains breaking changes. Please refer to the [migration guide](https://github.com/getsentry/sentry-javascript-bundler-plugins/blob/main/MIGRATION.md) on how to update from version `0.3.x` to `0.4.x`.

- deps(core): Bump unplugin version (#164)
- ref(core): Only inject release into entrypoints per default (#166) (BREAKING)
- ref: Remove `customHeader` option (#167) (BREAKING)
- ref: Turn default exports into named exports (#165) (BREAKING)

Work in this release contributed by @manniL. Thank you for your contribution!

## 0.3.0

Note: This release bumps the [`@sentry/cli`](https://www.npmjs.com/package/@sentry/cli) dependency from version `1.x` to version `2.x`.

- feat(core): Add headers option (#153)

Work in this release contributed by @robertcepa. Thank you for your contribution!

## 0.2.4

- build(core): Update magic-string due to deprecated dependency (#146)
- ref(core): Send project as `dist` in telemetry (#148)

Work in this release contributed by @jperelli. Thank you for your contribution!

## 0.2.3

- fix: Exclude `node_modules` from release injection (#143)

## 0.2.2

- feat(core): Remove `server_name` from telemetry events (#135)
- fix: Add definitions in package.json for ESM resolution (#141)
- fix(core): Finish spans when CLI commands fail (#136)
- ref(core): Decouple breadcrumb usage from logger (#138)
- ref(core): Don't record stack traces for telemetry (#137)

## 0.2.1

- fix(core): Fix telemetry option logic (#128)
- fix(core): Normalize `id` and `releaseInjectionTargets` in `transformInclude` (#132)

## 0.2.0

This release replaces the `entries` option with `releaseInjectionTargets` which is a breaking change from previous versions.
For more information, take a look at the [migration guide](https://github.com/getsentry/sentry-javascript-bundler-plugins/blob/main/MIGRATION.md#replacing-entries-option-with-releaseinjectiontargets).

- feat: Replace `entries` option with `releaseInjectionTargets` (#123)

## 0.1.0

With this release, the Sentry bundler plugins support all features of the standalone Sentry Webpack plugin.
Please note that breaking changes might still be introduced.

- Re-added Sentry CLI to the project (#85).
  The bundler plugins use Sentry CLI to create releases and upload sourcemaps
- Added missing Release creation steps
  - feat(core): Add `setCommits` (#96)
  - feat(core): Add `deploy` command (#97)
- Added validation of plugin options (#104)
- Refined `telemetry` option to only send events to Sentry for projects uploading source maps to Sentry's SaaS instance (#99). For self-hosted Sentry servers, nothing will be sent to Sentry.
- Updated `README.md` files with examples and option descriptions for each bundler plugin (#117)

Link to [Full Changelog](https://github.com/getsentry/sentry-javascript-bundler-plugins/compare/0.0.1-alpha.0...main)

## 0.0.1-alpha.0

This release marks the first release of the Sentry bundler blugins. This is still a heavy work in progress and a lot of things are still missing and subject to change

- Initial release
