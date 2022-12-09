/* eslint-env node */
const os = require('os');
const path = require('path');

const abi = require('node-abi');

function getModuleName() {
  return `sentry_cpu_profiler-v${abi.getAbi(process.versions.node, 'node')}-${os.platform()}-${os.arch()}.node`;
}

const source = path.join(__dirname, '..', 'build', 'Release', 'sentry_cpu_profiler.node');
const target = path.join(__dirname, '..', 'binaries', getModuleName());

module.exports.target = target;
module.exports.source = source;
