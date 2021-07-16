const { createServer } = require('http');
const { parse } = require('url');
const { stat } = require('fs').promises;
const next = require('next');

const createNextServer = async config => {
  const app = next(config);
  const handle = app.getRequestHandler();
  await app.prepare();
  return createServer((req, res) => handle(req, res, parse(req.url, true)));
};

const startServer = async (server, env) => {
  return new Promise((resolve, reject) => {
    server.listen(0, err => {
      if (err) {
        reject(err);
      } else {
        const url = `http://localhost:${server.address().port}`;
        resolve({ server, url, ...env });
      }
    });
  });
};

const parseEnvelope = body => {
  const [envelopeHeaderString, itemHeaderString, itemString] = body.split('\n');

  return {
    envelopeHeader: JSON.parse(envelopeHeaderString),
    itemHeader: JSON.parse(itemHeaderString),
    item: JSON.parse(itemString),
  };
};

const logIf = (condition, message, input, depth = 4) => {
  if (condition) {
    console.log(message);
    if (input) {
      console.dir(input, { depth, colors: true });
    }
  }
};

const COLOR_RESET = '\x1b[0m';
const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
};

const colorize = (str, color) => {
  if (!(color in COLORS)) {
    throw new Error(`Unknown color. Available colors: ${Object.keys(COLORS).join(', ')}`);
  }

  return `${COLORS[color]}${str}${COLOR_RESET}`;
};

const verifyDir = async path => {
  try {
    if (!(await stat(path)).isDirectory()) {
      throw new Error(`Invalid scenariosDir: ${path} is not a directory`);
    }
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error(`Invalid scenariosDir: ${path} does not exist`);
    }
    throw e;
  }
};

const sleep = duration => {
  return new Promise(resolve => setTimeout(() => resolve(), duration));
};

const waitForAll = actions => {
  return Promise.all(actions).catch(() => {
    throw new Error('Failed to await on all requested actions');
  });
};

module.exports = {
  colorize,
  createNextServer,
  logIf,
  parseEnvelope,
  sleep,
  startServer,
  verifyDir,
  waitForAll,
};
