// The file path selects the CommonJS build of the package. With the package name, the bundler takes the ES module
// build, also for a `require`. A CommonJS-only package such as `express` has only this build.
const {
  END,
  MessagesAnnotation,
  START,
  StateGraph,
} = require('../../../../node_modules/@langchain/langgraph/dist/index.cjs');

exports.compiled = new StateGraph(MessagesAnnotation)
  .addNode('agent', () => ({ messages: [{ role: 'assistant', content: 'Mock response' }] }))
  .addEdge(START, 'agent')
  .addEdge('agent', END)
  .compile({ name: 'module_scope_agent' });
