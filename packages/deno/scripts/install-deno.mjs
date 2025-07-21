import { execSync } from 'child_process';

import { download } from './download.mjs';

try {
  execSync('deno --version', { stdio: 'inherit' });
} catch {
  // eslint-disable-next-line no-console
  console.error('Deno is not installed. Installing...');
  if (process.platform === 'win32') {
    // TODO
    // eslint-disable-next-line no-console
    console.error('Please install Deno manually: https://docs.deno.com/runtime/manual/getting_started/installation');
    process.exit(1);
  } else {
    const script = await download('https://deno.land/x/install/install.sh');

    try {
      execSync(script, { stdio: 'inherit' });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to install Deno', e);
      process.exit(1);
    }
  }
}
