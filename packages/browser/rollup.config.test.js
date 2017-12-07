import commonjs from 'rollup-plugin-commonjs';
import resolve from 'rollup-plugin-node-resolve';

export default {
  input: 'dist/__tests__/browser.no-jest.js',
  output: {
    file: 'dist/bundle.js',
    format: 'iife',
    name: 'SentryBrowserTest',
  },
  plugins: [
    resolve({
      jsnext: true,
      main: true,
      browser: true,
    }),
    commonjs(),
  ],
};
