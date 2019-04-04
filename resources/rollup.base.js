import autoExternal from 'rollup-plugin-auto-external';
import typescript from 'rollup-plugin-typescript2';

export const paths = {
  '@sentry/utils/*': ['../utils/src/*'],
  '@sentry/core': ['../core/src'],
  '@sentry/hub': ['../hub/src'],
  '@sentry/types': ['../types/src'],
  '@sentry/minimal': ['../minimal/src'],
};

export function generate_cfg(module_name) {
  // TODO: License?

  const fesm5Config = {
    input: 'src/index.ts',
    output: {
      format: 'es',
      name: `@sentry/${module_name}`,
      sourcemap: true,
      file: `bundles/${module_name}.fesm5.js`,
    },
    context: 'window',
    plugins: [
      typescript({
        tsconfig: 'tsconfig.esm5.json',
        tsconfigOverride: {
          compilerOptions: {
            declaration: false,
            module: 'ES2015',
            paths: paths,
          },
        },
        include: ['*.ts+(|x)', '**/*.ts+(|x)', '../**/*.ts+(|x)'],
      }),
      autoExternal(),
    ],
  };

  const fesmnextConfig = {
    input: 'src/index.ts',
    output: {
      format: 'es',
      name: `@sentry/${module_name}`,
      sourcemap: true,
      file: `bundles/${module_name}.fesmnext.js`,
    },
    context: 'window',
    plugins: [
      typescript({
        tsconfig: 'tsconfig.esmnext.json',
        tsconfigOverride: {
          compilerOptions: {
            declaration: false,
            module: 'ES2015',
            paths: paths,
          },
        },
        include: ['*.ts+(|x)', '**/*.ts+(|x)', '../**/*.ts+(|x)'],
      }),
      autoExternal(),
    ],
  };
  return [fesm5Config, fesmnextConfig];
}
