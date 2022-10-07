/* eslint-disable no-console */
import * as fs from 'fs';
import * as path from 'path';

if (!process.env.E2E_TEST_AUTH_TOKEN) {
  const authTokenPath = path.resolve(__dirname, 'auth-token.json');
  const authTokenHint = "Put your auth token with scope 'project:read' here!";

  if (!fs.existsSync(authTokenPath)) {
    fs.writeFileSync(authTokenPath, JSON.stringify({ authToken: authTokenHint }, null, 2));
    console.log(
      'No auth token configured for E2E tests! Please set the E2E_TEST_AUTH_TOKEN environment variable or put your auth token in "auth-token.json"!',
    );

    process.exit(1);
  }

  let authTokenJson;
  try {
    authTokenJson = require(authTokenPath);
  } catch (e) {
    console.log('Failed to read auth-token.json!');
    process.exit(1);
  }

  const { authToken } = authTokenJson;

  if (!authToken || authToken === authTokenHint) {
    console.log('No auth token configured in auth-token.json!');
    process.exit(1);
  }
}
