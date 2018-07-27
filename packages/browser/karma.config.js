module.exports = function(config) {
  config.set({
    colors: true,
    singleRun: true,
    autoWatch: false,

    frameworks: ['mocha', 'chai', 'sinon', 'karma-typescript'],
    browsers: ['ChromeHeadless'],
    reporters: ['mocha', 'karma-typescript'],

    basePath: process.cwd(),
    files: ['test/**/*.ts', 'src/**/*.+(js|ts)'],
    preprocessors: {
      '**/*.+(js|ts)': ['karma-typescript'],
    },

    karmaTypescriptConfig: {
      tsconfig: 'tsconfig.json',
      compilerOptions: {
        declaration: false,
        allowJs: true,
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
