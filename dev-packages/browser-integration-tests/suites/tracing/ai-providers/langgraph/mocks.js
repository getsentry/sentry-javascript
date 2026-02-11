// Mock LangGraph graph for browser testing
export class MockStateGraph {
  compile(options = {}) {
    const compiledGraph = {
      name: options.name,
      graph_name: options.name,
      lc_kwargs: {
        name: options.name,
      },
      builder: {
        nodes: {},
      },
      invoke: async input => {
        const messages = input?.messages;
        return {
          messages: [
            ...messages,
            {
              role: 'assistant',
              content: 'Mock response from LangGraph',
            },
          ],
        };
      },
    };

    return compiledGraph;
  }
}
