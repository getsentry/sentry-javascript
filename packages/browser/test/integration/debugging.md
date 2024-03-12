### Debugging Hints

These tests are hard to debug, because the testing system is somewhat complex, straightforward debugging doesn't work
(see below), and the output of most `console.log` calls gets swallowed. Here, future debugger, are some tips to make it
easier, to hopefully save you the hour(s) of trial and error it took to figure them out.

- `suites/shell.js`:

  - Remove the loader options from the `variants` array.
  - Delete all of the placeholders of the form `{{ suites/something.js }}` except for the one you're interested in. It's
    not enough to comment them out, because they'll still exist in the file and get replaced by the test runner. Don't
    forget the one at the bottom of the file.

- `suites/helpers.js`:

  - Add `sandbox.contentWindow.console.log = (...args) => console.log(...args);` just before the return in
    `createSandbox()`. This will make it so that `console.log` statements come through to the terminal. (Yes, Karma
    theoretically has settings for that, but they don't seem to work. See
    https://github.com/karma-runner/karma-mocha/issues/47.)

- `suites.yourTestFile.js`:

  - Use `it.only` to only run the single test you're interested in.

- Repo-level `rollup/bundleHelpers.js`:

  - Comment out all bundle variants except whichever one `run.js` is turning into `artifacts/sdk.js`.

- Run `build:bundle:watch` in a separate terminal tab, so that when you add `console.log`s to the SDK, they get picked
  up.

- Don't bother trying to copy one of our standard VSCode debug profiles, because it won't work, except to debug the
  testing system itself. (It will pause the node process running the tests, not the headless browser in which the tests
  themselves run.)

- To make karma do verbose logging, run `export DEBUG=1`. To turn it off, run `unset DEBUG`.

- To make the testing system do verbose logging, run `yarn test:integration --debug`.

- To see exactly the files which are being run, comment out `rmdir('artifacts');` near the bottom of `run.js`.
