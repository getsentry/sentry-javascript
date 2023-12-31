# Using `yalc` for Local SDK Testing

[Yalc](https://github.com/wclr/yalc) is a simple local dependency repository which we can use to work with local
versions of our SDKs. This is a good alternative to `npm|yarn link` for packages where linking is problematic (e.g.
SvelteKit or Angular).

Here's how to set up and use yalc:

## Installing `yalc`

Either install yalc globally,

```sh
npm install -g yalc

yarn global add yalc
```

or add it to your desired test projects (same command without the `-g|global` flags)

## Registering/Updating packages

Whenever you want to make your local changes available to your test projects (e.g. after a local code change), run:

```sh
yarn yalc:publish
```

If you run this command in the root of the repo, this will publish all SDK packages to the local yalc repo. If you run
it in a specific SDK package, it will just publish this package. You **don't need to** call `yalc update` in your test
project. Already linked test projects will be update automatically.

## Using yalc packages

In your test project, run

```sh
yalc add @sentry/browser #or any other SDK package
```

to add the local SDK package to your project.

**Important:** You need to `yalc add` the dependencies of the SDK package as well (e.g. core, utils, types, etc.).

## Troubleshooting:

### My changes are not applied to the test project

Did you run `yarn build && yarn yalc:publish` after making your changes?

### My test project uses Vite and I still don't see changes

Vite pre-bundles and caches dependencies for dev builds. It
[doesn't recognize changes in yalc packages though](https://github.com/wclr/yalc/issues/189) :( To make these changes
show up anyway, run `vite dev --force`.
