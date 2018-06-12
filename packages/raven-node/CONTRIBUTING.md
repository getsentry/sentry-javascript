## How to release raven-node:

* [ ] Run the manual memory tests in `test/manual` to make sure we didn't introduce a memory leak
  * [ ] Consider whether any changes warrant additions to these tests
* [ ] Stop and think "What version number should this be according to SemVer?"
* [ ] Add an entry to the [History](https://github.com/getsentry/raven-node/blob/master/History.md) file.
* [ ] Bump version number in `package.json`
* [ ] Commit changes `git commit -am "<version>"`
* [ ] Create a tag `git tag -a <version> -m "<version>"`
* [ ] Push to GitHub (`git push origin master --follow-tags`).
* [ ] Once CI builds pass, `sentry-probot` will publish a release on npm and GitHub.
