import { execSync } from 'child_process';

async function download(url) {
  try {
    return await fetch(url).then(res => res.text());
  } catch (e) {
    console.error('Failed to download', url, e);
    process.exit(1);
  }
}

try {
  execSync('deno --version', { stdio: 'inherit' });
} catch (_) {
  console.error('Deno is not installed. Installing...');
  if (process.platform === 'win32') {
    // TODO
    console.error('Please install Deno manually: https://docs.deno.com/runtime/manual/getting_started/installation');
    process.exit(1);
  } else {
    const script = await download('https://deno.land/x/install/install.sh');

    try {
      execSync(script, { stdio: 'inherit' });
    } catch (e) {
      console.error('Failed to install Deno', e);
      process.exit(1);
    }
  }
}
