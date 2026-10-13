import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as Sentry from '@sentry/node';
import run from './run.cjs';

run({ Client, InMemoryTransport, McpServer, Sentry });
