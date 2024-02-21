const { fork } = require('child_process');
const { join } = require('path');

const child = fork(join(__dirname, 'forked.js'), { stdio: 'inherit' });
child.on('exit', () => {
  process.exit();
});
