import autoExternal from 'rollup-plugin-auto-external';
import typescript from 'rollup-plugin-typescript2';
import { resolve, join } from 'path';


/**
 * Generates a `path` value
 *
 * @param build
 * @returns {{}}
 */
export function getPaths(build) {
  return {
    // __dirname points to directory of rollup.config.js
    '@sentry/*': [join(resolve(__dirname), '../*', build)]
  };
}

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
            declarationMap: false,
            module: 'ES2015',
            paths: getPaths("esm5"),
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
            declarationMap: false,
            module: 'ES2015',
            paths: getPaths("esmnext"),
          },
        },
        include: ['*.ts+(|x)', '**/*.ts+(|x)', '../**/*.ts+(|x)'],
      }),
      autoExternal(),
    ],
  };
  return [fesm5Config, fesmnextConfig];
}
