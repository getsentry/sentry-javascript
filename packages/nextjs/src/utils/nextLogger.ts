/* eslint-disable no-console */
import * as chalk from 'chalk';

// This is nextjs's own logging formatting, vendored since it's not exported. See
// https://github.com/vercel/next.js/blob/c3ceeb03abb1b262032bd96457e224497d3bbcef/packages/next/build/output/log.ts#L3-L11
// and
// https://github.com/vercel/next.js/blob/de7aa2d6e486c40b8be95a1327639cbed75a8782/packages/next/lib/eslint/runLintCheck.ts#L321-L323.

const prefixes = {
  wait: `${chalk.cyan('wait')}  -`,
  error: `${chalk.red('error')} -`,
  warn: `${chalk.yellow('warn')}  -`,
  ready: `${chalk.green('ready')} -`,
  info: `${chalk.cyan('info')}  -`,
  event: `${chalk.magenta('event')} -`,
  trace: `${chalk.magenta('trace')} -`,
};

export const formatAsCode = (str: string): string => chalk.bold.cyan(str);

export const nextLogger: {
  [key: string]: (...message: unknown[]) => void;
} = {
  wait: (...message) => console.log(prefixes.wait, ...message),
  error: (...message) => console.error(prefixes.error, ...message),
  warn: (...message) => console.warn(prefixes.warn, ...message),
  ready: (...message) => console.log(prefixes.ready, ...message),
  info: (...message) => console.log(prefixes.info, ...message),
  event: (...message) => console.log(prefixes.event, ...message),
  trace: (...message) => console.log(prefixes.trace, ...message),
};
