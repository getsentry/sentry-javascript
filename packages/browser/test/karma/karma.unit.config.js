module.exports = config => {
  config.set({
    colors: true,
    singleRun: true,
    autoWatch: false,
    basePath: process.cwd(),
    files: ['test/**/*.ts', 'src/**/*.+(js|ts)'],
    frameworks: ['detectBrowsers', 'mocha', 'chai', 'sinon', 'karma-typescript'],
    browsers: [],
    reporters: ['mocha', 'karma-typescript'],
    preprocessors: {
      '**/*.+(js|ts)': ['karma-typescript'],
    },
    detectBrowsers: {
      usePhantomJS: false,
      preferHeadless: true,
      postDetection(availableBrowsers) {
        const browserWhitelist = ['FirefoxHeadless', 'ChromiumHeadless', 'ChromeHeadless'];
        for (const browser of browserWhitelist) {
          if (availableBrowsers.includes(browser)) {
            return [browser];
          }
        }

        // No suitable browser found, listing options to the user
        const listStr = browserWhitelist.map(v => v.replace(/Headless/g, '')).join(', ');
        throw new Error(`No suitable browser found: Please install one of: ${listStr}`);
      },
    },
    karmaTypescriptConfig: {
      tsconfig: 'tsconfig.json',
      compilerOptions: {
        allowJs: true,
        declaration: false,
        paths: {
          '@sentry/utils/*': ['../../utils/src/*'],
          '@sentry/core': ['../../core/src'],
          '@sentry/hub': ['../../hub/src'],
          '@sentry/types': ['../../types/src'],
          '@sentry/minimal': ['../../minimal/src'],
        },
      },
      bundlerOptions: {
        sourceMap: true,
        transforms: [require('karma-typescript-es6-transform')()],
      },
      include: ['test/**/*.ts'],
      reports: {
        html: 'coverage',
        'text-summary': '',
      },
    },
    // Uncomment if you want to silence console logs in the output
    // client: {
    //   captureConsole: false,
    // },
  });
};
