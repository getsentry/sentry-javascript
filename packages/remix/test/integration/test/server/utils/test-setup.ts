import express from 'express';
import { createRequestHandler } from '@remix-run/express';
import { Server } from 'http';

declare global {
  var __REMIX_SERVER__: Server;
}

/**
 * Runs a test server
 */
function runServer(): void {
  const app = express();

  app.all('*', createRequestHandler({ build: require('../../../build') }));

  globalThis.__REMIX_SERVER__ = app.listen(3000);
}

export default runServer;
