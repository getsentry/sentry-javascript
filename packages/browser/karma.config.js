module.exports = function(config) {
  config.set({
    colors: true,
    singleRun: true,
    autoWatch: false,

    frameworks: ['mocha', 'chai', 'sinon', 'karma-typescript'],
    browsers: ['ChromeHeadless'],
    reporters: ['mocha', 'karma-typescript'],

    basePath: process.cwd(),
    files: ['test/**/*.ts', 'src/**/*.ts'],
    preprocessors: {
      '**/*.ts': ['karma-typescript'],
    },

    karmaTypescriptConfig: {
      tsconfig: 'tsconfig.json',
      bundlerOptions: {
        sourceMap: true,
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
