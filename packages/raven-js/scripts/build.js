const rollup = require('rollup').rollup;
const babel = require('rollup-plugin-babel');
const commonjs = require('rollup-plugin-commonjs'); // Remove this plugin as soon as all modules are ES6
const resolve = require('rollup-plugin-node-resolve'); // Only needed for test build

/**
 * Build using rollup.js
 *
 * @see https://rollupjs.org/#javascript-api
 *
 * @param inputOptions
 * @param outputOptions
 * @returns Promise
 */
async function build(inputOptions, outputOptions) {
  const input = Object.assign(
    {
      plugins: [
        commonjs(), // We can remove this plugin if there are no more CommonJS modules
        resolve(), // We need this plugin only to build the test script
        babel({
          exclude: 'node_modules/**'
        })
      ]
    },
    inputOptions
  );

  const output = Object.assign(
    {
      format: 'umd'
    },
    outputOptions
  );

  const bundle = await rollup(input);
  await bundle.write(output);
}

module.exports = build;
