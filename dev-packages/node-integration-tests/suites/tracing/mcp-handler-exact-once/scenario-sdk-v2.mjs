import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import * as Sentry from '@sentry/node';
import run from './run.cjs';

run({ Client, InMemoryTransport, McpServer, Sentry });
