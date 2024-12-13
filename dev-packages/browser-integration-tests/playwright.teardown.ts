import * as childProcess from 'child_process';

export default function globalTeardown(): void {
  childProcess.execSync('yarn clean', { stdio: 'inherit', cwd: process.cwd() });
}
