/* eslint-disable no-console */

const { exec } = require('child_process');
const https = require('https');

// Define the URL of the Bash script for bun installation
const installScriptUrl = 'https://bun.sh/install';

// Check if bun is installed
exec('bun -version', error => {
  if (error) {
    console.error('bun is not installed. Installing...');
    // Download and execute the installation script
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
  } else {
    // Bun is installed
  }
});
