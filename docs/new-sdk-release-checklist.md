# New SDK Release Checklist

This page serves as a checklist of what to do when releasing a new SDK for the first time.

_This checklist was written while working on the `@sentry/svelte` Alpha 1 release. Some parts in this checklist might
differ slightly for other SDKs depending on how they are structured and how they work_

## Release Preparation:

- [ ] Make sure, the project is set up completely

  - [ ] The package exports the necessary modules
  - [ ] The package has a working unit testing environment
  - [ ] The package builds correctly (inspect `<package>/build` directory)

- [ ] Make sure that the `README.md` content is up to date and contains at least:

  - [ ] The correct name + a brief description of the SDK
  - [ ] Badges pointing to the correct (yet not existing) NPM package _(this isn’t deadly necessary but nice to have)_
  - [ ] If the SDK is not yet stable, a clear message indicating that it is in alpha/beta state and that breaking
        changes can still occur
  - [ ] A brief description how to set up and configure the SDK. If you already have docs, add a link to the docs,
        otherwise link to the “parent” SDK docs (e.g. `@sentry/browser`) if applicable
  - [ ] Extra information (e.g. how to upload sourcemaps)

- [ ] Make sure that the `LICENSE` file exists and has the correct license (We default to the `MIT` license)

  - [ ] Also check, that the same license is mentioned in `package.json`

- [ ] Make sure that the tarball (`yarn build:tarball`) has all the necessary contents

  For basic SDKs, this means that the tarball has at least these files:

  - [ ] `cjs/<entrypoint>.js`
  - [ ] `esm/<entrypoint>.js`
  - [ ] `types/<entrypoint.d.ts>`
  - [ ] `package.json`
    - [ ] Entry points registered in this file match the file structure above
  - [ ] `LICENSE`
  - [ ] `README.md`
  - [ ] If your tarball should contain additional files outside `esm`, `cjs`, and `types` that are not listed above
        (e.g. like Gatsby or Remix), be sure to add a package-specific `prepack.ts` script. In this script, you can copy
        these additional files and make other adjustments.\
         Check out the
        [Gatsby script](https://github.com/getsentry/sentry-javascript/blob/acd7fbb56ed1859ce48f06a76143075108631c25/packages/gatsby/scripts/prepack.ts#L1)
        as an example.\
         It’s recommended to build and pack a tarball and then `yarn add path/to/tarball.tar.gz` it to your test app(s)
        to ensure that it has all the correct files.

- [ ] Make sure `build.yml` CI script is correctly set up to cover tests for the new package

  - [ ] Ensure dependent packages are correctly set for “Determine changed packages”
  - [ ] Ensure unit tests run correctly

- [ ] Make sure the file paths in the
      ["Upload Artifacts" job](https://github.com/getsentry/sentry-javascript/blob/e5c1486eed236b878f2c49d6a04be86093816ac9/.github/workflows/build.yml#L314-L349)
      in `build.yml` include your new artifacts.

  - **This is especially important, if you're adding new CDN bundles!**
  - Tarballs (\*.tgz archives) should work OOTB

- [ ] Make sure it is added to the
      [Verdaccio config](https://github.com/getsentry/sentry-javascript/blob/develop/dev-packages/e2e-tests/verdaccio-config/config.yaml)
      for the E2E tests

- [ ] If the package you're adding is a dependency of fullstack framework (e.g. Remix or NextJS) SDKs, make sure that
      your package is added to the integration test apps' `"resolutions"` field in their `package.json`s.

## Cutting the Release

When you’re ready to make the first release, there are a couple of steps that need to be performed in the **correct
order**. Note that you can prepare the PRs at any time but the **merging oder** is important:

**All of these steps should happen when you’re committed to releasing the SDK in the _next upcoming_ release**.

### Before the Release:

- [ ] 1.  If not yet done, be sure to remove the `private: true` property from your SDK’s `package.json`. Additionally,
      ensure that `"publishConfig": {"access": "public"}` is set.
- [ ] 2.  Make sure that the new SDK is **not added**
      in`[craft.yml](https://github.com/getsentry/sentry-javascript/blob/develop/.craft.yml)` as a target for the
      **Sentry release registry**\
      _Once this is added, craft will try to publish an entry in the next release which does not work and caused failed release
      runs in the past_
- [ ] 3.  Add an `npm` target in `craft.yml` for the new package. Make sure to insert it in the right place, after all
      the Sentry dependencies of your package but before packages that depend on your new package (if applicable).
  ```yml
  - name: npm
    id: '@sentry/[yourPackage]'
    includeNames: /^sentry-[yourPackage]-\d.*\.tgz$/
  ```
- [ ] 4.  Cut a new release (as usual, see
      [Publishing Release](https://github.com/getsentry/sentry-javascript/blob/develop/docs/publishing-a-release.md))

### After the Release

- [ ] 4.  Check that the package was in fact published to NPM
- [ ] 5.  Add the new SDK to the [Sentry Release Registry](https://github.com/getsentry/sentry-release-registry) \
      Instructions on how to do this can be found [here](https://github.com/getsentry/sentry-release-registry#adding-new-sdks)
      \
      You have to fork this repo and PR the files from your fork to the main repo \
      [Example PR](https://github.com/getsentry/sentry-release-registry/pull/80) from the Svelte SDK

- [ ] 2.  Add an entry to [craft.yml](https://github.com/getsentry/sentry-javascript/blob/develop/.craft.yml) to add
      releases of your SDK to the Sentry release registry \
      [Example PR](https://github.com/getsentry/sentry-javascript/pull/5547) from the Svelte SDK \
      _Subsequent releases will now be added automatically to the registry_

## Follow-up Tasks

- [ ] Monitor GH for incoming bug reports/feature requests/praises/thank you messages/marriage proposals and potatoes
- [ ] Feel good about yourself 😎
