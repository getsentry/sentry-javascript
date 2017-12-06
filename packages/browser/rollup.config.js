import commonjs from 'rollup-plugin-commonjs';
import uglify from 'rollup-plugin-uglify';
import resolve from 'rollup-plugin-node-resolve';

export default {
  input: 'dist/standalone.js',
  output: {
    file: 'dist/build.min.js',
    format: 'cjs',
    exports: 'named',
  },
  plugins: [
    resolve({
      jsnext: true,
      main: true,
      browser: true,
    }),
    commonjs(),
    uglify(),
  ],
};
