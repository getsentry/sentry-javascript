# New Major Release Checklist

This page lists the tasks we do for each new major of the SDK. It is based on the v9, v10 and v11 majors. Most code
changes of a major are different each time. This list covers the tasks that repeat.

In this page, `vN` is the new major and `vN-1` is the previous major (e.g. `v11` and `v10`).

## Planning

- [ ] Create a Linear project `Major Release: N.0 [JavaScript]` and collect the breaking changes in it.
- [ ] Find the new minimum versions for Node.js, TypeScript, browsers and frameworks.
- [ ] Find all `TODO(vN)` comments in the code. Add a ticket for each breaking one. Change the non-breaking ones
      to a plain `TODO`, because they do not need a major (e.g. [#15080](https://github.com/getsentry/sentry-javascript/pull/15080)).
- [ ] Tell the company that we plan to ship `vN`, and open a public "What's coming in `vN`" GitHub issue (e.g.
      [#22056](https://github.com/getsentry/sentry-javascript/issues/22056)).
- [ ] Tell the company in a Vanguard post that we intend to ship a new major (e.g. https://vanguard.getsentry.net/p/i58qqnlqusz61lla86djbaly)
- [ ] Make sure that the wizard installs `^N-1` and not the latest major, so that it does not install a prerelease
      or an untested major (e.g. [getsentry/sentry-wizard#1303](https://github.com/getsentry/sentry-wizard/pull/1303)).
- [ ] Ship all deprecations in a `vN-1` minor before we remove the APIs in `vN`.

## Starting the Major on `develop`

- [ ] Cut the `vN-1` maintenance branch. See [Cutting a Maintenance Branch for a New Major](./cutting-a-major-branch.md).
- [ ] Start the migration guide. Move the current `MIGRATION.md` content to `docs/migration/vN-2-to-vN-1.md`, link it at
      the top of `MIGRATION.md`, and add a new `Upgrading from N-1.x to N.x` section (e.g. [#22364](https://github.com/getsentry/sentry-javascript/pull/22364)).
- [ ] Update the `compatibleRuntimes` of the `aws-lambda-layer` target to the new minimum Node.js version
      (e.g. [#23155](https://github.com/getsentry/sentry-javascript/pull/23155)). The layer name is `SentryNodeServerlessSDKv{{{major}}}`, so `vN` releases
      publish a new layer and do not replace the `vN-1` layer.

## Prereleases (alpha, beta)

- [ ] Release alphas and betas as described in [Publishing a Release](./publishing-a-release.md). Craft publishes prerelease versions with the `next` npm tag,
      so `latest` stays on `vN-1`. We do not publish Lambda layers for prereleases. The first `SentryNodeServerlessSDKvN` layer comes with `N.0.0`.
- [ ] Do not write a full changelog for a prerelease. Use this text, and link the migration guide at the prerelease tag:

  ```md
  ## N.0.0-alpha.0

  This is an alpha release of the upcoming major release of version N.
  This release does not yet entail a comprehensive changelog as version N is not yet stable.

  For this release's iteration of the migration guide, see the [Migration Guide as per `N.0.0-alpha.0`](https://github.com/getsentry/sentry-javascript/blob/N.0.0-alpha.0/MIGRATION.md#upgrading-from-n-1x-to-nx).

  Please note that the migration guide is work in progress and subject to change.
  ```

- [ ] Deploy pre-releases on our dog-fooding apps
  - [ ] https://github.com/getsentry/sentry
  - [ ] https://github.com/getsentry/gib-potato
  - [ ] https://github.com/getsentry/sentry-docs
  - [ ] https://github.com/getsentry/sentry-changelog
  - [ ] https://github.com/getsentry/chartcuterie
- [ ] Prepare (but do not merge) these PRs:
  - `sentry-docs`: the migration guide, setup guides, option changes and the new Lambda layer ARN.
  - `sentry-wizard`: change the installed SDK range to `^N` (e.g.
    [getsentry/sentry-wizard#1344](https://github.com/getsentry/sentry-wizard/pull/1344)) and update the wizard for the
    new APIs if applicable (e.g. [getsentry/sentry-wizard#1346](https://github.com/getsentry/sentry-wizard/pull/1346)).
  - `sentry`: the in-product onboarding snippets.
  - `sentry` (loader frontend): make the loader settings UI support `vN` (e.g.
    [getsentry/sentry#123892](https://github.com/getsentry/sentry/pull/123892)).
  - `sentry` (loader backend): make `vN` a selectable loader version, but keep `N-1` as the default (e.g.
    [getsentry/sentry#123893](https://github.com/getsentry/sentry/pull/123893)).

## Release Day

**Do these steps in this order.**

- [ ] 1. On the `vN-1` branch, add `"tag": "vN-1"` to the `publishConfig` of **every** published package (e.g.
      [#24619](https://github.com/getsentry/sentry-javascript/pull/24619)). If a package does not have it, the next
      `vN-1` patch release moves `latest` back to `vN-1` for that package
- [ ] 2. If we released on the `vN-1` branch, sync its changelog back into `develop` (e.g.
      [#24587](https://github.com/getsentry/sentry-javascript/pull/24587)).
- [ ] 3. Release `N.0.0`.
- [ ] 4. Make sure that `latest` points to `N.0.0` on npm and that the `SentryNodeServerlessSDKvN` Lambda layer
      exists.
- [ ] 5. Merge the docs, wizard and onboarding PRs.
- [ ] 6. Merge the loader frontend PR.
- [ ] 7. When the loader frontend PR is deployed, merge the loader backend PR. If the backend goes first, users can
      select `vN` in a UI that does not know its options yet.
- [ ] 8. Announce the release and close the "What's coming in `vN`" issue.
- [ ] 9. Pat yourself on the back for a job well done.

## After the Release

- [ ] When `vN` is stable, make it the default loader version (e.g.
      [getsentry/sentry#125867](https://github.com/getsentry/sentry/pull/125867)). For v10 this was one month after the
      release, for v11 one week.
- [ ] Retarget remaining `TODO(vN)` comments we did not get into the `vN` major to `vN+1`.
- [ ] Backport important fixes to the `vN-1` branch (see the `backport-pr` skill) for a certain time, decide the timespan with the team.
- [ ] Write a shipped Vanguard and include images representing your amazing sense of humor.
