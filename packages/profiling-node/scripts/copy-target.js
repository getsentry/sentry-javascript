const fs = require('fs');
const os = require('os');
const path = require('path');

const abi = require('node-abi');

const binaries = path.resolve(__dirname, '..', 'binaries');
if (!fs.existsSync(binaries)) {
  fs.mkdirSync(binaries);
}

const moduleName = `sentry_cpu_profiler-v${abi.getAbi()}-${os.platform()}-${os.arch()}.node`;

const source = path.join(__dirname, '..', 'build', 'Release', 'sentry_cpu_profiler.node');
const target = path.join(__dirname, '..', 'binaries', moduleName);

fs.renameSync(source, target);
