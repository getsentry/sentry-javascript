/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-aws-sdk
 * - Upstream version: @opentelemetry/instrumentation-aws-sdk@0.73.0
 */

import { Attributes, DiagLogger, diag, Span } from '@opentelemetry/api';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_SYSTEM,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
} from '@sentry/conventions/attributes';
import {
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
} from '../semconv';
import { AwsSdkInstrumentationConfig, NormalizedRequest, NormalizedResponse } from '../types';

// Simplified types inlined from @aws-sdk/client-bedrock-runtime
// Only the fields accessed by this instrumentation are included
interface TokenUsage {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
}

interface ConverseStreamOutput {
  messageStop?: { stopReason?: string };
  metadata?: { usage?: TokenUsage };
  [key: string]: any;
}

export class BedrockRuntimeServiceExtension implements ServiceExtension {
  private _diag: DiagLogger = diag;

  requestPreSpanHook(
    request: NormalizedRequest,
    config: AwsSdkInstrumentationConfig,
    diag: DiagLogger,
  ): RequestMetadata {
    switch (request.commandName) {
      case 'Converse':
        return this.requestPreSpanHookConverse(request, config, diag, false);
      case 'ConverseStream':
        return this.requestPreSpanHookConverse(request, config, diag, true);
      case 'InvokeModel':
        return this.requestPreSpanHookInvokeModel(request, config, diag, false);
      case 'InvokeModelWithResponseStream':
        return this.requestPreSpanHookInvokeModel(request, config, diag, true);
    }

    return {
      isIncoming: false,
    };
  }

  private requestPreSpanHookConverse(
    request: NormalizedRequest,
    config: AwsSdkInstrumentationConfig,
    diag: DiagLogger,
    isStream: boolean,
  ): RequestMetadata {
    let spanName = GEN_AI_OPERATION_NAME_VALUE_CHAT;
    const spanAttributes: Attributes = {
      // oxlint-disable-next-line typescript/no-deprecated
      [GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
      [GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
    };

    const modelId = request.commandInput.modelId;
    if (modelId) {
      spanAttributes[GEN_AI_REQUEST_MODEL] = modelId;
      if (spanName) {
        spanName += ` ${modelId}`;
      }
    }

    const inferenceConfig = request.commandInput.inferenceConfig;
    if (inferenceConfig) {
      const { maxTokens, temperature, topP, stopSequences } = inferenceConfig;
      if (maxTokens !== undefined) {
        spanAttributes[GEN_AI_REQUEST_MAX_TOKENS] = maxTokens;
      }
      if (temperature !== undefined) {
        spanAttributes[GEN_AI_REQUEST_TEMPERATURE] = temperature;
      }
      if (topP !== undefined) {
        spanAttributes[GEN_AI_REQUEST_TOP_P] = topP;
      }
      if (stopSequences !== undefined) {
        spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = stopSequences;
      }
    }

    return {
      spanName,
      isIncoming: false,
      isStream,
      spanAttributes,
    };
  }

  private requestPreSpanHookInvokeModel(
    request: NormalizedRequest,
    config: AwsSdkInstrumentationConfig,
    diag: DiagLogger,
    isStream: boolean,
  ): RequestMetadata {
    const spanAttributes: Attributes = {
      // oxlint-disable-next-line typescript/no-deprecated
      [GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
      // add operation name for InvokeModel API
    };

    const modelId = request.commandInput?.modelId;
    if (modelId) {
      spanAttributes[GEN_AI_REQUEST_MODEL] = modelId;
    }

    if (request.commandInput?.body) {
      const requestBody = JSON.parse(request.commandInput.body);
      if (modelId.includes('amazon.titan')) {
        if (requestBody.textGenerationConfig?.temperature !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TEMPERATURE] = requestBody.textGenerationConfig.temperature;
        }
        if (requestBody.textGenerationConfig?.topP !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TOP_P] = requestBody.textGenerationConfig.topP;
        }
        if (requestBody.textGenerationConfig?.maxTokenCount !== undefined) {
          spanAttributes[GEN_AI_REQUEST_MAX_TOKENS] = requestBody.textGenerationConfig.maxTokenCount;
        }
        if (requestBody.textGenerationConfig?.stopSequences !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = requestBody.textGenerationConfig.stopSequences;
        }
      } else if (modelId.includes('amazon.nova')) {
        if (requestBody.inferenceConfig?.temperature !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TEMPERATURE] = requestBody.inferenceConfig.temperature;
        }
        if (requestBody.inferenceConfig?.top_p !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TOP_P] = requestBody.inferenceConfig.top_p;
        }
        if (requestBody.inferenceConfig?.max_new_tokens !== undefined) {
          spanAttributes[GEN_AI_REQUEST_MAX_TOKENS] = requestBody.inferenceConfig.max_new_tokens;
        }
        if (requestBody.inferenceConfig?.stopSequences !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = requestBody.inferenceConfig.stopSequences;
        }
      } else if (modelId.includes('anthropic.claude')) {
        if (requestBody.max_tokens !== undefined) {
          spanAttributes[GEN_AI_REQUEST_MAX_TOKENS] = requestBody.max_tokens;
        }
        if (requestBody.temperature !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TEMPERATURE] = requestBody.temperature;
        }
        if (requestBody.top_p !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TOP_P] = requestBody.top_p;
        }
        if (requestBody.stop_sequences !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = requestBody.stop_sequences;
        }
      } else if (modelId.includes('meta.llama')) {
        if (requestBody.max_gen_len !== undefined) {
          spanAttributes[GEN_AI_REQUEST_MAX_TOKENS] = requestBody.max_gen_len;
        }
        if (requestBody.temperature !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TEMPERATURE] = requestBody.temperature;
        }
        if (requestBody.top_p !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TOP_P] = requestBody.top_p;
        }
        // request for meta llama models does not contain stop_sequences field
      } else if (modelId.includes('cohere.command-r')) {
        if (requestBody.max_tokens !== undefined) {
          spanAttributes[GEN_AI_REQUEST_MAX_TOKENS] = requestBody.max_tokens;
        }
        if (requestBody.temperature !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TEMPERATURE] = requestBody.temperature;
        }
        if (requestBody.p !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TOP_P] = requestBody.p;
        }
        if (requestBody.message !== undefined) {
          // NOTE: We approximate the token count since this value is not directly available in the body
          // According to Bedrock docs they use (total_chars / 6) to approximate token count for pricing.
          // https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-prepare.html
          spanAttributes[GEN_AI_USAGE_INPUT_TOKENS] = Math.ceil(requestBody.message.length / 6);
        }
        if (requestBody.stop_sequences !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = requestBody.stop_sequences;
        }
      } else if (modelId.includes('cohere.command')) {
        if (requestBody.max_tokens !== undefined) {
          spanAttributes[GEN_AI_REQUEST_MAX_TOKENS] = requestBody.max_tokens;
        }
        if (requestBody.temperature !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TEMPERATURE] = requestBody.temperature;
        }
        if (requestBody.p !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TOP_P] = requestBody.p;
        }
        if (requestBody.prompt !== undefined) {
          // NOTE: We approximate the token count since this value is not directly available in the body
          // According to Bedrock docs they use (total_chars / 6) to approximate token count for pricing.
          // https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-prepare.html
          spanAttributes[GEN_AI_USAGE_INPUT_TOKENS] = Math.ceil(requestBody.prompt.length / 6);
        }
        if (requestBody.stop_sequences !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = requestBody.stop_sequences;
        }
      } else if (modelId.includes('mistral')) {
        if (requestBody.prompt !== undefined) {
          // NOTE: We approximate the token count since this value is not directly available in the body
          // According to Bedrock docs they use (total_chars / 6) to approximate token count for pricing.
          // https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-prepare.html
          spanAttributes[GEN_AI_USAGE_INPUT_TOKENS] = Math.ceil(requestBody.prompt.length / 6);
        }
        if (requestBody.max_tokens !== undefined) {
          spanAttributes[GEN_AI_REQUEST_MAX_TOKENS] = requestBody.max_tokens;
        }
        if (requestBody.temperature !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TEMPERATURE] = requestBody.temperature;
        }
        if (requestBody.top_p !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TOP_P] = requestBody.top_p;
        }
        if (requestBody.stop !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = requestBody.stop;
        }
      }
    }

    return {
      isIncoming: false,
      isStream,
      spanAttributes,
    };
  }

  responseHook(response: NormalizedResponse, span: Span) {
    if (!span.isRecording()) {
      return;
    }

    switch (response.request.commandName) {
      case 'Converse':
        return this.responseHookConverse(response, span);
      case 'ConverseStream':
        return this.responseHookConverseStream(response, span);
      case 'InvokeModel':
        return this.responseHookInvokeModel(response, span);
      case 'InvokeModelWithResponseStream':
        return this.responseHookInvokeModelWithResponseStream(response, span);
    }
  }

  private responseHookConverse(response: NormalizedResponse, span: Span) {
    const { stopReason, usage } = response.data;

    BedrockRuntimeServiceExtension.setStopReason(span, stopReason);
    this.setUsage(response, span, usage);
  }

  private responseHookConverseStream(response: NormalizedResponse, span: Span) {
    return {
      ...response.data,
      // Wrap and replace the response stream to allow processing events to telemetry
      // before yielding to the user.
      stream: this.wrapConverseStreamResponse(response, response.data.stream, span),
    };
  }

  private async *wrapConverseStreamResponse(
    response: NormalizedResponse,
    stream: AsyncIterable<ConverseStreamOutput>,
    span: Span,
  ) {
    try {
      let usage: TokenUsage | undefined;
      for await (const item of stream) {
        BedrockRuntimeServiceExtension.setStopReason(span, item.messageStop?.stopReason);
        usage = item.metadata?.usage;
        yield item;
      }
      this.setUsage(response, span, usage);
    } finally {
      span.end();
    }
  }

  private static setStopReason(span: Span, stopReason: string | undefined) {
    if (stopReason !== undefined) {
      span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [stopReason]);
    }
  }

  private setUsage(response: NormalizedResponse, span: Span, usage: TokenUsage | undefined) {
    if (usage) {
      const { inputTokens, outputTokens } = usage;
      if (inputTokens !== undefined) {
        span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, inputTokens);
      }
      if (outputTokens !== undefined) {
        span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, outputTokens);
      }
    }
  }

  private responseHookInvokeModel(response: NormalizedResponse, span: Span) {
    const currentModelId = response.request.commandInput?.modelId;
    if (response.data?.body) {
      const decodedResponseBody = new TextDecoder().decode(response.data.body);
      const responseBody = JSON.parse(decodedResponseBody);
      if (currentModelId.includes('amazon.titan')) {
        if (responseBody.inputTextTokenCount !== undefined) {
          span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, responseBody.inputTextTokenCount);
        }
        if (responseBody.results?.[0]?.tokenCount !== undefined) {
          span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, responseBody.results[0].tokenCount);
        }
        if (responseBody.results?.[0]?.completionReason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [responseBody.results[0].completionReason]);
        }
      } else if (currentModelId.includes('amazon.nova')) {
        if (responseBody.usage !== undefined) {
          if (responseBody.usage.inputTokens !== undefined) {
            span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, responseBody.usage.inputTokens);
          }
          if (responseBody.usage.outputTokens !== undefined) {
            span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, responseBody.usage.outputTokens);
          }
        }
        if (responseBody.stopReason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [responseBody.stopReason]);
        }
      } else if (currentModelId.includes('anthropic.claude')) {
        if (responseBody.usage?.input_tokens !== undefined) {
          span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, responseBody.usage.input_tokens);
        }
        if (responseBody.usage?.output_tokens !== undefined) {
          span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, responseBody.usage.output_tokens);
        }
        if (responseBody.stop_reason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [responseBody.stop_reason]);
        }
      } else if (currentModelId.includes('meta.llama')) {
        if (responseBody.prompt_token_count !== undefined) {
          span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, responseBody.prompt_token_count);
        }
        if (responseBody.generation_token_count !== undefined) {
          span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, responseBody.generation_token_count);
        }
        if (responseBody.stop_reason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [responseBody.stop_reason]);
        }
      } else if (currentModelId.includes('cohere.command-r')) {
        if (responseBody.text !== undefined) {
          // NOTE: We approximate the token count since this value is not directly available in the body
          // According to Bedrock docs they use (total_chars / 6) to approximate token count for pricing.
          // https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-prepare.html
          span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, Math.ceil(responseBody.text.length / 6));
        }
        if (responseBody.finish_reason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [responseBody.finish_reason]);
        }
      } else if (currentModelId.includes('cohere.command')) {
        if (responseBody.generations?.[0]?.text !== undefined) {
          span.setAttribute(
            GEN_AI_USAGE_OUTPUT_TOKENS,
            // NOTE: We approximate the token count since this value is not directly available in the body
            // According to Bedrock docs they use (total_chars / 6) to approximate token count for pricing.
            // https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-prepare.html
            Math.ceil(responseBody.generations[0].text.length / 6),
          );
        }
        if (responseBody.generations?.[0]?.finish_reason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [responseBody.generations[0].finish_reason]);
        }
      } else if (currentModelId.includes('mistral')) {
        if (responseBody.outputs?.[0]?.text !== undefined) {
          span.setAttribute(
            GEN_AI_USAGE_OUTPUT_TOKENS,
            // NOTE: We approximate the token count since this value is not directly available in the body
            // According to Bedrock docs they use (total_chars / 6) to approximate token count for pricing.
            // https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-prepare.html
            Math.ceil(responseBody.outputs[0].text.length / 6),
          );
        }
        if (responseBody.outputs?.[0]?.stop_reason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [responseBody.outputs[0].stop_reason]);
        }
      }
    }
  }

  private async responseHookInvokeModelWithResponseStream(response: NormalizedResponse, span: Span): Promise<any> {
    const stream = response.data?.body;
    const modelId = response.request.commandInput?.modelId;
    if (!stream || !modelId) return;

    // Replace the original response body with our instrumented stream.
    // - Defers span.end() until the entire stream is consumed
    // This ensures downstream consumers still receive the full stream correctly,
    // while OpenTelemetry can record span attributes from streamed data.
    response.data.body = async function* (this: BedrockRuntimeServiceExtension) {
      try {
        for await (const chunk of stream) {
          const parsedChunk = this.parseChunk(chunk?.chunk?.bytes);

          if (!parsedChunk) {
            // pass through
          } else if (modelId.includes('amazon.titan')) {
            BedrockRuntimeServiceExtension.recordTitanAttributes(parsedChunk, span);
          } else if (modelId.includes('anthropic.claude')) {
            BedrockRuntimeServiceExtension.recordClaudeAttributes(parsedChunk, span);
          } else if (modelId.includes('amazon.nova')) {
            BedrockRuntimeServiceExtension.recordNovaAttributes(parsedChunk, span);
          } else if (modelId.includes('meta.llama')) {
            BedrockRuntimeServiceExtension.recordLlamaAttributes(parsedChunk, span);
          } else if (modelId.includes('cohere.command-r')) {
            BedrockRuntimeServiceExtension.recordCohereRAttributes(parsedChunk, span);
          } else if (modelId.includes('cohere.command')) {
            BedrockRuntimeServiceExtension.recordCohereAttributes(parsedChunk, span);
          } else if (modelId.includes('mistral')) {
            BedrockRuntimeServiceExtension.recordMistralAttributes(parsedChunk, span);
          }
          yield chunk;
        }
      } finally {
        span.end();
      }
    }.bind(this)();
    return response.data;
  }

  private parseChunk(bytes?: Uint8Array): any {
    if (!bytes || !(bytes instanceof Uint8Array)) return null;
    try {
      const str = Buffer.from(bytes).toString('utf-8');
      return JSON.parse(str);
    } catch (err) {
      this._diag.warn('Failed to parse streamed chunk', err);
      return null;
    }
  }

  private static recordNovaAttributes(parsedChunk: any, span: Span) {
    if (parsedChunk.metadata?.usage !== undefined) {
      if (parsedChunk.metadata?.usage.inputTokens !== undefined) {
        span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, parsedChunk.metadata.usage.inputTokens);
      }
      if (parsedChunk.metadata?.usage.outputTokens !== undefined) {
        span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, parsedChunk.metadata.usage.outputTokens);
      }
    }
    if (parsedChunk.messageStop?.stopReason !== undefined) {
      span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [parsedChunk.messageStop.stopReason]);
    }
  }

  private static recordClaudeAttributes(parsedChunk: any, span: Span) {
    if (parsedChunk.message?.usage?.input_tokens !== undefined) {
      span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, parsedChunk.message.usage.input_tokens);
    }
    if (parsedChunk.message?.usage?.output_tokens !== undefined) {
      span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, parsedChunk.message.usage.output_tokens);
    }
    if (parsedChunk.delta?.stop_reason !== undefined) {
      span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [parsedChunk.delta.stop_reason]);
    }
  }

  private static recordTitanAttributes(parsedChunk: any, span: Span) {
    if (parsedChunk.inputTextTokenCount !== undefined) {
      span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, parsedChunk.inputTextTokenCount);
    }
    if (parsedChunk.totalOutputTextTokenCount !== undefined) {
      span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, parsedChunk.totalOutputTextTokenCount);
    }
    if (parsedChunk.completionReason !== undefined) {
      span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [parsedChunk.completionReason]);
    }
  }
  private static recordLlamaAttributes(parsedChunk: any, span: Span) {
    if (parsedChunk.prompt_token_count !== undefined) {
      span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, parsedChunk.prompt_token_count);
    }
    if (parsedChunk.generation_token_count !== undefined) {
      span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, parsedChunk.generation_token_count);
    }
    if (parsedChunk.stop_reason !== undefined) {
      span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [parsedChunk.stop_reason]);
    }
  }

  private static recordMistralAttributes(parsedChunk: any, span: Span) {
    if (parsedChunk.outputs?.[0]?.text !== undefined) {
      span.setAttribute(
        GEN_AI_USAGE_OUTPUT_TOKENS,
        // NOTE: We approximate the token count since this value is not directly available in the body
        // According to Bedrock docs they use (total_chars / 6) to approximate token count for pricing.
        // https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-prepare.html
        Math.ceil(parsedChunk.outputs[0].text.length / 6),
      );
    }
    if (parsedChunk.outputs?.[0]?.stop_reason !== undefined) {
      span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [parsedChunk.outputs[0].stop_reason]);
    }
  }

  private static recordCohereAttributes(parsedChunk: any, span: Span) {
    if (parsedChunk.generations?.[0]?.text !== undefined) {
      span.setAttribute(
        GEN_AI_USAGE_OUTPUT_TOKENS,
        // NOTE: We approximate the token count since this value is not directly available in the body
        // According to Bedrock docs they use (total_chars / 6) to approximate token count for pricing.
        // https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-prepare.html
        Math.ceil(parsedChunk.generations[0].text.length / 6),
      );
    }
    if (parsedChunk.generations?.[0]?.finish_reason !== undefined) {
      span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [parsedChunk.generations[0].finish_reason]);
    }
  }

  private static recordCohereRAttributes(parsedChunk: any, span: Span) {
    if (parsedChunk.text !== undefined) {
      // NOTE: We approximate the token count since this value is not directly available in the body
      // According to Bedrock docs they use (total_chars / 6) to approximate token count for pricing.
      // https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-prepare.html
      span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, Math.ceil(parsedChunk.text.length / 6));
    }
    if (parsedChunk.finish_reason !== undefined) {
      span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [parsedChunk.finish_reason]);
    }
  }
}
