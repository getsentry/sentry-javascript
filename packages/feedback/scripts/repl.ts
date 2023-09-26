/* eslint:disable: no-console */
import * as fs from 'fs';
import inquirer from 'inquirer';
import { EventEmitter } from 'node:events';
import * as path from 'path';
import type { Frame} from 'playwright';
import {chromium} from 'playwright';
// import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const emitter = new EventEmitter();

function getCode(): string {
  const bundlePath = path.resolve(__dirname, '../replay/build/bundles/replay.debug.min.js');
  return fs.readFileSync(bundlePath, 'utf8');
}

void (async () => {
  const code = getCode();

  async function injectRecording(frame: Frame) {
    await frame.evaluate((rrwebCode: string) => {
      const win = window;
      // @ts-expect-error global
      if (win.__IS_RECORDING__) return;
      // @ts-expect-error global
      win.__IS_RECORDING__ = true;

      (async () => {
        function loadScript(code: string) {
          const s = document.createElement('script');
          const r = false;
          s.type = 'text/javascript';
          s.innerHTML = code;
          if (document.head) {
            document.head.append(s);
          } else {
            requestAnimationFrame(() => {
              document.head.append(s);
            });
          }
        }
        loadScript(rrwebCode);

        // @ts-expect-error global
        win.__replay = new Sentry.Replay({
          blockAllMedia: false,
          maskAllText: false,
          useCompression: false,
          mutationBreadcrumbLimit: 250,
        })
        // @ts-expect-error global
        Sentry.init({
          debug: true,
          dsn: '',
          environment: 'repl',
          tracesSampleRate: 1.0,
          replaysSessionSampleRate: 1.0,
          integrations: [
            // @ts-expect-error global
            win.__replay
            // new BrowserTracing({
            // tracingOrigins: ["localhost:3000", "localhost", /^\//],
            // }),
          ],
        })
      })();
    }, code);
  }

  await start('https://react-redux.realworld.io');

  // const fakeGoto = async (page, url) => {
  //   const intercept = async (request) => {
  //     await request.respond({
  //       status: 200,
  //       contentType: 'text/html',
  //       body: ' ', // non-empty string or page will load indefinitely
  //     });
  //   };
  //   await page.setRequestInterception(true);
  //   page.on('request', intercept);
  //   await page.goto(url);
  //   await page.setRequestInterception(false);
  //   page.off('request', intercept);
  // };

  async function start(defaultURL: string) {
    let { url } = await inquirer.prompt([
      {
        type: 'input',
        name: 'url',
        message: `Enter the url you want to record, e.g [${defaultURL}]: `,
      },
    ]);

    if (url === '') {
      url = defaultURL;
    }

    console.log(`Going to open ${url}...`);
    await record(url);
    console.log('Ready to record. You can do any interaction on the page.');

    // const { shouldReplay } = await inquirer.prompt([
    //   {
    //     type: 'list',
    //     choices: [
    //       { name: 'Start replay (default)', value: 'default' },
    //       {
    //         name: 'Start replay on original url (helps when experiencing CORS issues)',
    //         value: 'replayWithFakeURL',
    //       },
    //       { name: 'Skip replay', value: false },
    //     ],
    //     name: 'shouldReplay',
    //     message: 'Once you want to finish the recording, choose the following to start replay: ',
    //   },
    // ]);

    emitter.emit('done');

    /**
     * not needed atm as we always save to Sentry
     */
    // const { shouldStore } = await inquirer.prompt([
    //   {
    //     type: 'confirm',
    //     name: 'shouldStore',
    //     message: 'Persistently store these recorded events?',
    //   },
    // ]);

    // if (shouldStore) {
    //   saveEvents();
    // }

    const { shouldRecordAnother } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldRecordAnother',
        message: 'Record another one?',
      },
    ]);

    if (shouldRecordAnother) {
      start(url);
    } else {
      process.exit();
    }
  }

  async function record(url: string) {
    const browser = await chromium.launch({
      headless: false,
      args: [
        '--start-maximized',
        '--ignore-certificate-errors',
        '--no-sandbox',
        '--auto-open-devtools-for-tabs',
      ],
    });
    const context = await browser.newContext({
      viewport: {
        width: 1600,
        height: 900,
      },
    });
    const page = await context.newPage();

    // await page.exposeFunction('_replLog', (event) => {
    //   events.push(event);
    // });

    page.on('framenavigated', async (frame: Frame) => {
      await injectRecording(frame);
    });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 300000,
    });

    emitter.once('done', async () => {
      await context.close();
      await browser.close();
      console.log('go to sentry to view this replay');
      // if (shouldReplay) {
      //   await replay(url, shouldReplay === 'replayWithFakeURL');
      // }
    });
  }

  // async function replay(url, useSpoofedUrl) {
  //   const browser = await puppeteer.launch({
  //     headless: false,
  //     defaultViewport: {
  //       width: 1600,
  //       height: 900,
  //     },
  //     args: ['--start-maximized', '--no-sandbox'],
  //   });
  //   const page = await browser.newPage();
  //   if (useSpoofedUrl) {
  //     await fakeGoto(page, url);
  //   } else {
  //     await page.goto('about:blank');
  //   }
  //
  //   await page.addStyleTag({
  //     path: path.resolve(__dirname, '../dist/rrweb.css'),
  //   });
  //   await page.evaluate(`${code}
  //     const events = ${JSON.stringify(events)};
  //     const replayer = new rrweb.Replayer(events, {
  //       UNSAFE_replayCanvas: true
  //     });
  //     replayer.play();
  //   `);
  // }

//   function saveEvents() {
//     const tempFolder = path.join(__dirname, '../temp');
//     console.log(tempFolder);
//
//     if (!fs.existsSync(tempFolder)) {
//       fs.mkdirSync(tempFolder);
//     }
//     const time = new Date()
//       .toISOString()
//       .replace(/[-|:]/g, '_')
//       .replace(/\..+/, '');
//     const fileName = `replay_${time}.html`;
//     const content = `
// <!DOCTYPE html>
// <html lang="en">
//   <head>
//     <meta charset="UTF-8" />
//     <meta name="viewport" content="width=device-width, initial-scale=1.0" />
//     <meta http-equiv="X-UA-Compatible" content="ie=edge" />
//     <title>Record @${time}</title>
//     <link rel="stylesheet" href="../dist/rrweb.css" />
//   </head>
//   <body>
//     <script src="../dist/rrweb.js"></script>
//     <script>
//       /*<!--*/
//       const events = ${JSON.stringify(events).replace(
//         /<\/script>/g,
//         '<\\/script>',
//       )};
//       /*-->*/
//       const replayer = new rrweb.Replayer(events, {
//         UNSAFE_replayCanvas: true
//       });
//       replayer.play();
//     </script>
//   </body>
// </html>
//     `;
//     const savePath = path.resolve(tempFolder, fileName);
//     fs.writeFileSync(savePath, content);
//     console.log(`Saved at ${savePath}`);
//   }

  process
    .on('uncaughtException', (error) => {
      console.error(error);
    })
    .on('unhandledRejection', (error) => {
      console.error(error);
    });
})();
