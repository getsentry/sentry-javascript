/* eslint-disable no-console */
if (process.env.CI) {
  // This script is not needed in CI we install bun via GH actions
  process.exit(0);
}
const { exec } = require('child_process');
const https = require('https');

// Define the URL of the Bash script for bun installation
const installScriptUrl = 'https://bun.sh/install';

// Check if bun is installed
exec('bun --version', (error, version) => {
  if (error) {
    console.error('bun is not installed. Installing...');
    installLatestBun();
  } else {
    exec('bun upgrade', (error, stdout, stderr) => {
      if (error) {
        console.error('Failed to upgrade bun:', error);
        process.exit(1);
      }

      const out = [stdout, stderr].join('\n');

      if (out.includes("You're already on the latest version of Bun")) {
        console.log('Bun is already up to date.');
        return;
      }

      console.log(out);
    });
  }
});

function installLatestBun() {
  https
    .get(installScriptUrl, res => {
      if (res.statusCode !== 200) {
        console.error(`Failed to download the installation script (HTTP ${res.statusCode})`);
        process.exit(1);
      }

      res.setEncoding('utf8');
      let scriptData = '';

      res.on('data', chunk => {
        scriptData += chunk;
      });

      res.on('end', () => {
        // Execute the downloaded script
        exec(scriptData, installError => {
          if (installError) {
            console.error('Failed to install bun:', installError);
            process.exit(1);
          }
          console.log('bun has been successfully installed.');
        });
      });
    })
    .on('error', e => {
      console.error('Failed to download the installation script:', e);
      process.exit(1);
    });
}
