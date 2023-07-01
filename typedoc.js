/** @type {import('typedoc').TypeDocOptions} */
module.exports = {
  out: './typedoc/docs/',
  readme: 'README.md',
  name: 'Sentry JavaScript SDKs',
  entryPoints: ['packages/*'],
  exclude: ['./packages/typescript'],
  entryPointStrategy: 'packages',
  // logLevel: 'Verbose',
  // excludeExternals: true,
};
