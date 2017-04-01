## How to release raven-node:
  * [ ] Run the manual memory tests in `test/manual` to make sure we didn't introduce a memory leak
    * [ ] Consider whether any changes warrant additions to these tests
  * [ ] Stop and think "What version number should this be according to SemVer?"
  * [ ] Bump version number in `package.json`.
  * [ ] Add an entry to the [History](https://github.com/getsentry/raven-node/blob/master/History.md) file.
  * [ ] Commit new version, create a tag (`git tag -a v1.2.3 -m "Version 1.2.3"`). Push to GitHub (`git push --follow-tags`).
  * [ ] Copy History entry into a new GH Release: https://github.com/getsentry/raven-node/releases
  * [ ] `$ npm publish` to push to npm.
  * [ ] Verify that `npm install raven@1.2.3` works.
  * [ ] glhf
