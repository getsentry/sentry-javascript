import { createServer, Server } from 'http';
import { parse } from 'url';
import { promises, PathLike } from 'fs';
import next from 'next';
import { NextServer } from 'next/dist/server/next';

const { stat } = promises;

// Type not exported from NextJS
type NextServerConstructor = ConstructorParameters<typeof NextServer>[0];

export const createNextServer = async (config: NextServerConstructor) => {
  const app = next(config);
  const handle = app.getRequestHandler();
  await app.prepare();

  return createServer((req, res) => {
    const { url } = req;

    if (!url) {
      throw new Error('No url');
    }

    handle(req, res, parse(url, true));
  });
};

export const startServer = async (server: Server, port: string | number) => {
  return new Promise(resolve => {
    server.listen(port || 0, () => {
      const url = `http://localhost:${port}`;
      resolve({ server, url });
    });
  });
};

export const COLOR_RESET = '\x1b[0m';
export const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
};

export const colorize = (str: string, color: 'green' | 'red') => {
  if (!(color in COLORS)) {
    throw new Error(`Unknown color. Available colors: ${Object.keys(COLORS).join(', ')}`);
  }

  return `${COLORS[color]}${str}${COLOR_RESET}`;
};

export const verifyDir = async (path: PathLike) => {
  if (!(await stat(path)).isDirectory()) {
    throw new Error(`Invalid scenariosDir: ${path} is not a directory`);
  }
};

export const sleep = (duration: number) => {
  return new Promise<void>(resolve => setTimeout(() => resolve(), duration));
};

export const waitForAll = (actions: any[]) => {
  return Promise.all(actions).catch(() => {
    throw new Error('Failed to await on all requested actions');
  });
};
