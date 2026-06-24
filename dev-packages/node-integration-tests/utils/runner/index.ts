import { cleanupChildProcesses } from './createRunner';

export { createRunner } from './createRunner';
export { createEsmAndCjsTests } from './createEsmAndCjsTests';
export { cleanupChildProcesses };

// Backup call to cleanup everything leftover on process exit
// Generally, each runner should cleanup their own stuff, but if something slips through...
process.on('exit', cleanupChildProcesses);
