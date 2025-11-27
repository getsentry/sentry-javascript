// Mock LangChain Chat Model for browser testing
export class MockChatAnthropic {
  constructor(params) {
    this._model = params.model;
    this._temperature = params.temperature;
    this._maxTokens = params.maxTokens;
  }

  async invoke(messages, config = { callbacks: [] }) {
    const callbacks = config.callbacks;
    const runId = 'mock-run-id-123';

    const invocationParams = {
      model: this._model,
      temperature: this._temperature,
      max_tokens: this._maxTokens,
    };

    const serialized = {
      lc: 1,
      type: 'constructor',
      id: ['langchain', 'anthropic', 'anthropic'],
      kwargs: invocationParams,
    };

    // Call handleChatModelStart
    for (const callback of callbacks) {
      if (callback.handleChatModelStart) {
        await callback.handleChatModelStart(
          serialized,
          messages,
          runId,
          undefined,
          undefined,
          { invocation_params: invocationParams },
          { ls_model_name: this._model, ls_provider: 'anthropic' },
        );
      }
    }

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 10));

    // Create mock result
    const result = {
      generations: [
        [
          {
            text: 'Mock response from Anthropic!',
            generationInfo: {
              finish_reason: 'stop',
            },
          },
        ],
      ],
      llmOutput: {
        tokenUsage: {
          promptTokens: 10,
          completionTokens: 15,
          totalTokens: 25,
        },
        model_name: this._model,
        id: 'msg_mock123',
      },
    };

    // Call handleLLMEnd
    for (const callback of callbacks) {
      if (callback.handleLLMEnd) {
        await callback.handleLLMEnd(result, runId);
      }
    }

    return result;
  }
}
