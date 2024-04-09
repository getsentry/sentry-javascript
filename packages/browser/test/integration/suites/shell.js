var variants = ['frame', 'loader', 'loader-lazy-no'];

function runVariant(variant) {
  var IS_LOADER = !!variant.match(/^loader/);
  var IS_ASYNC_LOADER = !!variant.match(/^loader$/);
  var IS_SYNC_LOADER = !!variant.match(/^loader-lazy-no$/);

  describe(variant, function () {
    this.timeout(60000);
    this.retries(3);

    var sandbox;

    beforeEach(function (done) {
      sandbox = createSandbox(done, variant);
    });

    afterEach(function () {
      document.body.removeChild(sandbox);
    });

    /**
     * The test runner will replace each of these placeholders with the contents of the corresponding file.
     */
    {{ suites/onerror.js }} // biome-ignore format: No trailing commas
    {{ suites/onunhandledrejection.js }} // biome-ignore format: No trailing commas
    {{ suites/builtins.js }} // biome-ignore format: No trailing commas
    {{ suites/loader.js }} // biome-ignore format: No trailing commas
  });
}

for (var idx in variants) {
  (function () {
    runVariant(variants[idx]);
  })();
}

{{ suites/loader-specific.js }} // biome-ignore format: No trailing commas
