// Mock LangChain types and classes for testing the callback handler

// Minimal callback handler interface to match LangChain's callback handler signature
export interface CallbackHandler {
  handleChatModelStart?: (
    llm: unknown,
    messages: unknown,
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[] | Record<string, unknown>,
    metadata?: Record<string, unknown>,
    runName?: string,
  ) => unknown;
  handleLLMEnd?: (output: unknown, runId: string) => unknown;
  handleChainStart?: (chain: { name?: string }, inputs: Record<string, unknown>, runId: string) => unknown;
  handleChainEnd?: (outputs: unknown, runId: string) => unknown;
  handleToolStart?: (tool: { name?: string }, input: string, runId: string) => unknown;
  handleToolEnd?: (output: unknown, runId: string) => unknown;
}

export interface LangChainMessage {
  role: string;
  content: string;
}

export interface LangChainLLMResult {
  generations: Array<
    Array<{
      text: string;
      generationInfo?: Record<string, unknown>;
    }>
  >;
  llmOutput?: {
    tokenUsage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  };
}

export interface InvocationParams {
  model: string;
  temperature?: number;
  maxTokens?: number;
}

// Mock LangChain Chat Model
export class MockChatModel {
  private _model: string;
  private _temperature?: number;
  private _maxTokens?: number;

  public constructor(params: InvocationParams) {
    this._model = params.model;
    this._temperature = params.temperature;
    this._maxTokens = params.maxTokens;
  }

  public async invoke(
    messages: LangChainMessage[] | string,
    options?: { callbacks?: CallbackHandler[] },
  ): Promise<LangChainLLMResult> {
    const callbacks = options?.callbacks || [];
    const runId = crypto.randomUUID();

    // Get invocation params to match LangChain's signature
    const invocationParams = {
      model: this._model,
      temperature: this._temperature,
      max_tokens: this._maxTokens,
    };

    // Create serialized representation similar to LangChain
    const serialized = {
      lc: 1,
      type: 'constructor',
      id: ['langchain', 'anthropic', 'anthropic'], // Third element is used as system provider
      kwargs: invocationParams,
    };

    // Call handleChatModelStart
    // Pass tags as a record with invocation_params for proper extraction
    // The callback handler's getInvocationParams utility accepts both string[] and Record<string, unknown>
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

    // Create mock result
    const result: LangChainLLMResult = {
      generations: [
        [
          {
            text: 'Mock response from LangChain!',
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

// Mock LangChain Chain
export class MockChain {
  private _name: string;

  public constructor(name: string) {
    this._name = name;
  }

  public async invoke(
    inputs: Record<string, unknown>,
    options?: { callbacks?: CallbackHandler[] },
  ): Promise<Record<string, unknown>> {
    const callbacks = options?.callbacks || [];
    const runId = crypto.randomUUID();

    // Call handleChainStart
    for (const callback of callbacks) {
      if (callback.handleChainStart) {
        await callback.handleChainStart({ name: this._name }, inputs, runId);
      }
    }

    const outputs = { result: 'Chain execution completed!' };

    // Call handleChainEnd
    for (const callback of callbacks) {
      if (callback.handleChainEnd) {
        await callback.handleChainEnd(outputs, runId);
      }
    }

    return outputs;
  }
}

// Mock LangChain Tool
export class MockTool {
  private _name: string;

  public constructor(name: string) {
    this._name = name;
  }

  public async call(input: string, options?: { callbacks?: CallbackHandler[] }): Promise<string> {
    const callbacks = options?.callbacks || [];
    const runId = crypto.randomUUID();

    // Call handleToolStart
    for (const callback of callbacks) {
      if (callback.handleToolStart) {
        await callback.handleToolStart({ name: this._name }, input, runId);
      }
    }

    const output = `Tool ${this._name} executed with input: ${input}`;

    // Call handleToolEnd
    for (const callback of callbacks) {
      if (callback.handleToolEnd) {
        await callback.handleToolEnd(output, runId);
      }
    }

    return output;
  }
}
