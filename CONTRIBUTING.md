# Contributing

## Reporting Issues and Asking Questions

Before opening an issue, please search the issue tracker to make sure your issue hasn't already been reported.

## Bugs and Improvements

We use the issue tracker to keep track of bugs and improvements to Raven.js itself, plugins, and the documentation. We encourage you to open issues to discuss improvements, architecture, implementation, etc. If a topic has been discussed before, we will ask you to join the previous discussion.

## Getting Help

For support or usage questions like “how do I do X with Raven.js and “my code doesn't work”, please search and ask on the [Sentry forum](https://forum.sentry.io).

## Help Us Help You

On both GitHub and the Sentry forum, it is a good idea to structure your code and question in a way that is easy to read and understand. For example, we encourage you to use syntax highlighting, indentation, and split text in paragraphs.

Additionally, it is helpful if you can let us know:

* The version of Raven.js affected
* The browser and OS affected
* Which Raven.js plugins are enabled, if any
* If you are using [hosted Sentry](https://sentry.io) or on-premises, and if the latter, which version (e.g. 8.7.0)
* If you are using the Raven CDN (http://ravenjs.com)

Lastly, it is strongly encouraged to provide a small project reproducing your issue. You can put your code on [JSFiddle](https://jsfiddle.net/) or, for bigger projects, on GitHub. Make sure all the necessary dependencies are declared in package.json so anyone can run npm install && npm start and reproduce your issue.

## Development

### Setting up an Environment

To run the test suite and run our code linter, node.js and npm are required. If you don't have node installed, [get it here](http://nodejs.org/download/) first.

Installing all other dependencies is as simple as:

```bash
$ npm install
```

And if you don't have [Grunt](http://gruntjs.com/) already, feel free to install that globally:

```bash
$ npm install -g grunt-cli
```

### Running the Test Suite

The test suite is powered by [Mocha](http://visionmedia.github.com/mocha/) and [Karma](https://karma-runner.github.io/) and can both run from the command line or in the browser.

From the command line (run all required checks):

```bash
$ npm run test
```

From your browser (run unit tests):

```bash
$ npm run test:karma:unit
```

or (run integration tests):

```bash
$ npm run test:karma:integration
```

Then visit: http://localhost:9876/debug.html

Keep in mind that in order for in-browser tests to work correctly, they need to be bundled first:

```bash
$ grunt build.test
```

If you want to make sure that your changes will fit in our 10kB budget:

```bash
$ npm run test:size
```

### Compiling Raven.js

The simplest way to compile your own version of Raven.js is with the supplied grunt command:

```bash
$ grunt build
```

By default, this will compile raven.js and all of the included plugins.

If you only want to compile the core raven.js:

```bash
$ grunt build.core
```

Files are compiled into `build/`.

## Contributing Back Code

Please, send over suggestions and bug fixes in the form of pull requests on [GitHub](https://github.com/getsentry/raven-js). Any nontrivial fixes/features should include tests.
Do not include any changes to the `dist/` folder or bump version numbers yourself.

## Documentation

The documentation is written using [reStructuredText](http://en.wikipedia.org/wiki/ReStructuredText), and compiled using [Sphinx](http://sphinx-doc.org/). If you don't have Sphinx installed, you can do it using following command (assuming you have Python already installed in your system):

```bash
$ pip install sphinx
```

Documentation can be then compiled by running:

```bash
$ make docs
```

Afterwards you can view it in your browser by running following command and than pointing your browser to http://127.0.0.1:8000/:

```bash
$ grunt run:docs
```

## Releasing New Version

_This is a checklist for core contributors when releasing a new version._

  * ⚠ WARNING: once `docs/sentry-doc-config.json` is bumped on master, it can be pulled by a docs deploy at any time, so complete this process up to `grunt publish` and `npm publish` immediately to ensure docs don't reference a non-existent version link ⚠
  * [ ] Run `npm run deploy` and follow instructions
  * [ ] Deploy [docs](https://github.com/getsentry/sentry-docs) so that docs, code examples display the latest version change.
  * [ ] Confirm that the new version exists behind `cdn.ravenjs.com`
  * [ ] Bump version in the `gh-pages` branch specifically for http://ravenjs.com/.
  * [ ] Bump sentry.io `<script>` tag of raven.js https://github.com/getsentry/sentry.io/blob/master/src/_includes/raven-js.html and it's tests https://github.com/getsentry/sentry.io/blob/master/tests/thirdParty.spec.js
  * [ ] Bump `package.json` in Sentry repo https://github.com/getsentry/sentry/blob/master/package.json
  * [ ] Bump version for Segment integration since they don't: https://github.com/segment-integrations/analytics.js-integration-sentry
  * [ ] glhf
