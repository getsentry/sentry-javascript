const { parseSemver } = require('@sentry/utils');

const NODE_VERSION = parseSemver(process.versions.node);

/**
 * Get http modules.
 */
function getHttpModules() {
  const httpModule = require('http');

  // NOTE: Prior to Node 9, `https` used internals of `http` module, thus we don't patch it.
  // If we do, we'd get double breadcrumbs and double spans for `https` calls.
  // It has been changed in Node 9, so for all versions equal and above, we patch `https` separately.
  const httpsModule = NODE_VERSION.major && NODE_VERSION.major > 8 ? require('https') : undefined;

  return {
    httpModule,
    httpsModule,
  };
}

module.exports = {
  getHttpModules,
};
