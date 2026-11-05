import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { wrapMcpServerWithSentry } from '@sentry/node';
import { z } from 'zod';
import run from './scenario-common.cjs';

const server = wrapMcpServerWithSentry(new McpServer({ name: 'test-server', version: '1.0.0' }), {
  recordInputs: process.env.RECORD_CONTENT === 'true',
  recordOutputs: process.env.RECORD_CONTENT === 'true',
});
const client = new Client({ name: 'test-client', version: '1.0.0' });

run(server, client, InMemoryTransport, z);
