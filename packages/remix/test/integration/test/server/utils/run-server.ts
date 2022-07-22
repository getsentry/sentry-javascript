import express, { Express } from 'express';
import { createRequestHandler } from '@remix-run/express';

/**
 * Runs a test server
 */
function runServer(testDir: string): void {
  const app = express();

  app.all('*', createRequestHandler({ build: require('../../../build') }));

  app.listen(3000);

  // TODO: Finish app after tests
}

export default runServer;
