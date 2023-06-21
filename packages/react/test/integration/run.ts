/* eslint-disable no-console */
import { exec } from 'child_process';
import * as fs from 'fs';

async function run(): Promise<void> {
  // The ESLint plugin `react-scripts` uses is not compatible with our setup.
  process.env.DISABLE_ESLINT_PLUGIN = 'true';

  fs.readdirSync(__dirname, { withFileTypes: true })
    .filter(testApp => testApp.isDirectory())
    .forEach(testApp => {
      exec(`cd ${__dirname}/${testApp.name} && yarn && yarn build && yarn test`, (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
        }

        console.log(`stdout: ${stdout}`);
        console.error(`stderr: ${stderr}`);
      });
    });
}

void run();
