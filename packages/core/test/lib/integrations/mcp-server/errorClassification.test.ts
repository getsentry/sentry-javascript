import { ERROR_TYPE, RPC_RESPONSE_STATUS_CODE } from '@sentry/conventions/attributes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as currentScopes from '../../../../src/currentScopes';
import * as exports from '../../../../src/exports';
import { wrapMcpServerWithSentry } from '../../../../src/integrations/mcp-server';
import type { JsonRpcResponse } from '../../../../src/integrations/mcp-server/types';
import { SentrySpan } from '../../../../src/tracing/sentrySpan';
import { SPAN_STATUS_ERROR } from '../../../../src/tracing/spanstatus';
import * as tracing from '../../../../src/tracing/trace';
import { spanToJSON } from '../../../../src/utils/spanUtils';
import { createMockClient, createMockMcpServer, createMockTransport } from './testUtils';

describe('MCP server response error classification', () => {
  beforeEach(() => {
    vi.spyOn(currentScopes, 'getClient').mockReturnValue(createMockClient());
    vi.spyOn(exports, 'captureException').mockReturnValue('event-id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createRequest(method: string) {
    const span = new SentrySpan({ name: method });
    vi.spyOn(tracing, 'startInactiveSpan').mockReturnValue(span);
    const server = wrapMcpServerWithSentry(createMockMcpServer(), { recordOutputs: false });
    const transport = createMockTransport();
    const send = transport.send;

    await server.connect(transport);
    transport.onmessage({ jsonrpc: '2.0', id: 'request-1', method }, {});

    return { span, transport, send };
  }

  it.each([
    { code: -32700, message: 'Parse error' },
    { code: -32600, message: 'Invalid Request' },
    { code: -32601, message: 'Method not found' },
    { code: -32602, message: 'Invalid params' },
    { code: -32002, message: 'Resource not found' },
  ])('records $message ($code) without reporting a server failure', async ({ code, message }) => {
    const { span, transport, send } = await createRequest('resources/list');
    const response: JsonRpcResponse = Object.freeze({
      jsonrpc: '2.0',
      id: 'request-1',
      error: Object.freeze({ code, message, data: { reason: 'unsupported request' } }),
    });
    const sendOptions = { relatedRequestId: 'request-1' };

    await transport.send(response, sendOptions);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(response, sendOptions);
    const result = spanToJSON(span);
    expect(result.status).toBe('ok');
    expect(result.attributes[RPC_RESPONSE_STATUS_CODE]).toBe(String(code));
    expect(result.attributes[ERROR_TYPE]).toBeUndefined();
    expect(result.attributes['sentry.status.message']).toBeUndefined();
    expect(result.end_timestamp).toBeDefined();
    expect(exports.captureException).not.toHaveBeenCalled();
  });

  it.each([-32603, -32099, -32000, -32020, -32021, -32022, -32042, 1000])(
    'reports JSON-RPC error %s as a server failure',
    async code => {
      const { span, transport, send } = await createRequest('tools/call');
      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: 'request-1',
        error: { code, message: 'Request could not be completed' },
      };

      await transport.send(response);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(response);
      const result = spanToJSON(span);
      expect(result.status).toBe('error');
      expect(result.attributes[RPC_RESPONSE_STATUS_CODE]).toBe(String(code));
      expect(result.attributes[ERROR_TYPE]).toBe(String(code));
      expect(result.attributes['sentry.status.message']).toBe('Request could not be completed');
      expect(exports.captureException).toHaveBeenCalledTimes(1);
      expect(exports.captureException).toHaveBeenCalledWith(
        Object.assign(new Error('Request could not be completed'), { name: `JsonRpcError_${code}` }),
        { mechanism: { type: 'auto.ai.mcp_server', handled: false, data: { error_type: 'protocol' } } },
      );
    },
  );

  it('preserves a previously recorded failure when the response is a caller error', async () => {
    const { span, transport } = await createRequest('resources/list');
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'A separate failure' });

    await transport.send({
      jsonrpc: '2.0',
      id: 'request-1',
      error: { code: -32601, message: 'Method not found' },
    });

    const result = spanToJSON(span);
    expect(result.status).toBe('error');
    expect(result.attributes['sentry.status.message']).toBe('A separate failure');
  });

  it('reports a tool error independently of output capture', async () => {
    const { span, transport, send } = await createRequest('tools/call');
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: 'request-1',
      result: { isError: true, content: [{ type: 'text', text: 'Tool failed' }] },
    };

    await transport.send(response);

    expect(send).toHaveBeenCalledWith(response);
    const result = spanToJSON(span);
    expect(result.status).toBe('error');
    expect(result.attributes[ERROR_TYPE]).toBe('tool_error');
    expect(result.attributes[RPC_RESPONSE_STATUS_CODE]).toBeUndefined();
    expect(result.attributes['mcp.tool.result.is_error']).toBe(true);
    expect(result.attributes['mcp.tool.result.content']).toBeUndefined();
    expect(exports.captureException).not.toHaveBeenCalled();
  });

  it('does not classify an input_required tool response as a server failure', async () => {
    const { span, transport, send } = await createRequest('tools/call');
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: 'request-1',
      result: { resultType: 'input_required', requestState: 'opaque-state' },
    };

    await transport.send(response);

    expect(send).toHaveBeenCalledWith(response);
    const result = spanToJSON(span);
    expect(result.status).toBe('ok');
    expect(result.attributes[RPC_RESPONSE_STATUS_CODE]).toBeUndefined();
    expect(result.attributes[ERROR_TYPE]).toBeUndefined();
    expect(result.end_timestamp).toBeDefined();
    expect(exports.captureException).not.toHaveBeenCalled();
  });

  it('does not leak error classification into a subsequent successful response', async () => {
    const { transport } = await createRequest('resources/list');
    await transport.send({ jsonrpc: '2.0', id: 'request-1', error: { code: -32601, message: 'Method not found' } });
    const span = new SentrySpan({ name: 'tools/call' });
    vi.mocked(tracing.startInactiveSpan).mockReturnValue(span);
    transport.onmessage({ jsonrpc: '2.0', id: 'request-2', method: 'tools/call' }, {});

    await transport.send({ jsonrpc: '2.0', id: 'request-2', result: { isError: false, content: [] } });

    const result = spanToJSON(span);
    expect(result.status).toBe('ok');
    expect(result.attributes[RPC_RESPONSE_STATUS_CODE]).toBeUndefined();
    expect(result.attributes[ERROR_TYPE]).toBeUndefined();
    expect(result.attributes['mcp.tool.result.is_error']).toBe(false);
  });
});
