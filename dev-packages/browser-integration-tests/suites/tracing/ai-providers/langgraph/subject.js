import { MockStateGraph } from './mocks.js';
import { instrumentLangGraph } from '@sentry/browser';

// Test that manual instrumentation doesn't crash the browser
// The instrumentation automatically creates spans
// Test both agent creation and invocation

const graph = new MockStateGraph();
instrumentLangGraph(graph, { recordInputs: false, recordOutputs: false });
const compiledGraph = graph.compile({ name: 'mock-graph' });

const response = await compiledGraph.invoke({
  messages: [{ role: 'user', content: 'What is the capital of France?' }],
});

console.log('Received response', response);
