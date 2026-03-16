import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  spanToJSON,
  startSpan,
} from '../../../src';
import { createLangChainCallbackHandler } from '../../../src/tracing/langchain';
import { getSpanDescendants } from '../../../src/utils/spanUtils';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('createLangChainCallbackHandler sendDefaultPii resolution', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  afterEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  function setup(sendDefaultPii: boolean): void {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1, sendDefaultPii });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  }

  it('defaults recordInputs and recordOutputs to false when sendDefaultPii is false', () => {
    setup(false);
    const handler = createLangChainCallbackHandler();
    const runId = 'run-1';

    startSpan({ name: 'test-root' }, rootSpan => {
      handler.handleToolStart?.({ name: 'my_tool' }, 'tool input text', runId);
      handler.handleToolEnd?.('tool output text', runId);

      const descendants = getSpanDescendants(rootSpan);
      const toolSpan = descendants.find(s => s !== rootSpan && spanToJSON(s).op === 'gen_ai.execute_tool');
      expect(toolSpan).toBeDefined();

      const data = spanToJSON(toolSpan!).data;
      expect(data?.['gen_ai.tool.input']).toBeUndefined();
      expect(data?.['gen_ai.tool.output']).toBeUndefined();
    });
  });

  it('respects sendDefaultPii: true', () => {
    setup(true);
    const handler = createLangChainCallbackHandler();
    const runId = 'run-2';

    startSpan({ name: 'test-root' }, rootSpan => {
      handler.handleToolStart?.({ name: 'my_tool' }, 'tool input text', runId);
      handler.handleToolEnd?.('tool output text', runId);

      const descendants = getSpanDescendants(rootSpan);
      const toolSpan = descendants.find(s => s !== rootSpan && spanToJSON(s).op === 'gen_ai.execute_tool');
      expect(toolSpan).toBeDefined();

      const data = spanToJSON(toolSpan!).data;
      expect(data?.['gen_ai.tool.input']).toBe('tool input text');
      expect(data?.['gen_ai.tool.output']).toBe('"tool output text"');
    });
  });

  it('explicit options override sendDefaultPii', () => {
    setup(true);
    const handler = createLangChainCallbackHandler({ recordInputs: false });
    const runId = 'run-3';

    startSpan({ name: 'test-root' }, rootSpan => {
      handler.handleToolStart?.({ name: 'my_tool' }, 'tool input text', runId);
      handler.handleToolEnd?.('tool output text', runId);

      const descendants = getSpanDescendants(rootSpan);
      const toolSpan = descendants.find(s => s !== rootSpan && spanToJSON(s).op === 'gen_ai.execute_tool');
      expect(toolSpan).toBeDefined();

      const data = spanToJSON(toolSpan!).data;
      // recordInputs explicitly false → no tool input
      expect(data?.['gen_ai.tool.input']).toBeUndefined();
      // recordOutputs still true from sendDefaultPii → tool output present
      expect(data?.['gen_ai.tool.output']).toBe('"tool output text"');
    });
  });
});
