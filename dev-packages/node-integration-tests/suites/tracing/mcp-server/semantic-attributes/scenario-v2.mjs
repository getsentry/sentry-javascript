import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { wrapMcpServerWithSentry } from '@sentry/node';
import { z } from 'zod/v4';
import run from './scenario-common.cjs';

const server = wrapMcpServerWithSentry(new McpServer({ name: 'test-server', version: '1.0.0' }), {
  recordInputs: process.env.RECORD_CONTENT === 'true',
  recordOutputs: process.env.RECORD_CONTENT === 'true',
});
const client = new Client({ name: 'test-client', version: '1.0.0' });

run(server, client, InMemoryTransport, z);
