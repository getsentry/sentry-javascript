/**
 * Cloudflare Agents Integration
 *
 * Provides tracing for Cloudflare Agents by wrapping entry point methods.
 */

import type { Span } from '@sentry/core';
import {
  _INTERNAL_getTruncatedJsonString,
  getActiveSpan,
  getClient,
  isThenable,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import {
  CLOUDFLARE_AGENTS_ORIGIN,
  CLOUDFLARE_AGENTS_SYSTEM,
  DEFAULT_INVOKE_AGENT_OPERATION,
  GEN_AI_AGENT_NAME_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_OPERATION_TYPE_ATTRIBUTE,
  GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
} from './constants';
import type { InstrumentCloudflareAgentsOptions } from './types';
import { shouldInstrumentMethod } from './utils';

// Track which agent classes we've already instrumented
const _instrumentedClasses = new WeakSet<object>();

/**
 * Instruments a Cloudflare Agent class by wrapping its entry point methods.
 *
 * This creates `gen_ai.invoke_agent` spans at agent entry points (RPC, HTTP, WebSocket)
 * but NOT for internal method calls. This ensures proper span hierarchy and avoids duplicate spans.
 *
 * **IMPORTANT**: You must pass YOUR specific agent class (e.g., `CounterAgent`), not the base
 * `Agent` class from the 'agents' package.
 *
 * **Recording inputs and outputs:**
 *
 * By default, inputs and outputs are controlled by the `sendDefaultPii` option. To explicitly
 * enable or disable recording:
 *
 * ```typescript
 * instrumentCloudflareAgent(CounterAgent, {
 *   recordInputs: true,   // Records method arguments using gen_ai.input.messages
 *   recordOutputs: true,  // Records method return values using gen_ai.output.messages
 * })
 * ```
 *
 * **What gets instrumented (entry points only):**
 * -`@callable()` methods - Records arguments as gen_ai.input.messages
 * -`onRequest(request)` - Records HTTP request info
 * -`onMessage(connection, message)` - Records WebSocket message content
 * -`onConnect(connection, ctx)` - Records connection info
 * **Additional notes:**
 * - Inputs/outputs are formatted as message objects following Sentry semantic conventions
 * - The underlying AI model calls (e.g., OpenAI) should be instrumented separately
 * - Call this once at module initialization, before handling any requests
 *
 * @param AgentClass - YOUR agent class (e.g., CounterAgent), NOT the base Agent from 'agents'
 * @param options - Options for instrumentation
 *
 * @example
 * ```typescript
 * import * as Sentry from '@sentry/cloudflare';
 * import { Agent } from 'agents';
 * import OpenAI from 'openai';
 *
 * // Define your agent class
 * export class CounterAgent extends Agent<Env> {
 *   async onRequest(request: Request): Promise<Response> {
 *     const openai = new OpenAI({ apiKey: this.env.OPENAI_API_KEY });
 *     const completion = await openai.chat.completions.create({
 *       model: 'gpt-4',
 *       messages: [{ role: 'user', content: 'Hello' }]
 *     });
 *     return Response.json({ text: completion.choices[0].message.content });
 *   }
 *
 *   @callable()
 *   async increment() {
 *     this.setState({ count: this.state.count + 1 });
 *     return this.state.count;
 *   }
 * }
 *
 *
 * export default Sentry.withSentry(
 *   (env) => ({
 *     dsn: env.SENTRY_DSN,
 *     tracesSampleRate: 1.0,
 *   }),
 *   {
 *     async fetch(request, env, ctx) {
 *       // Instrument your agent class 
 *       Sentry.instrumentCloudflareAgent(CounterAgent, {
 *         recordInputs: true,
 *         recordOutputs: true,
 *       });
 *
 *       const agentId = env.COUNTER_AGENT.idFromName('my-counter');
 *       const agent = env.COUNTER_AGENT.get(agentId);
 *       return await agent.fetch(request);
 *     },
 *   }
 * );
 * ```
 */
export function instrumentCloudflareAgent<T>(
  AgentClass: T & { prototype: object; name: string },
  options: InstrumentCloudflareAgentsOptions = {},
): T {
  // Skip if already instrumented
  if (_instrumentedClasses.has(AgentClass)) {
    return AgentClass;
  }

  const client = getClient();
  if (!client) {
    return AgentClass;
  }

  const shouldRecordInputs = options.recordInputs ?? client.getOptions().sendDefaultPii ?? false;
  const shouldRecordOutputs = options.recordOutputs ?? client.getOptions().sendDefaultPii ?? false;

  instrumentAgentClass(AgentClass, shouldRecordInputs, shouldRecordOutputs);
  _instrumentedClasses.add(AgentClass);

  return AgentClass;
}

/**
 * Instruments a specific agent class by wrapping its entry point methods
 */
function instrumentAgentClass(
  AgentClass: { prototype: object; name: string },
  shouldRecordInputs: boolean,
  shouldRecordOutputs: boolean,
): void {
  // Get all property names from the prototype
  const proto = AgentClass.prototype as Record<string, unknown>;
  const propertyNames = Object.getOwnPropertyNames(proto);

  // Get the base Agent class properties to filter them out
  const baseProto = Object.getPrototypeOf(proto);
  const basePropertyNames = baseProto ? Object.getOwnPropertyNames(baseProto) : [];

  for (const methodName of propertyNames) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, methodName);
    if (!descriptor || typeof descriptor.value !== 'function') {
      continue;
    }

    // Determine if this is a user-defined method (not inherited from Agent base)
    const isUserDefined = !basePropertyNames.includes(methodName);

    if (!shouldInstrumentMethod(methodName, isUserDefined)) {
      continue;
    }

    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;

    // Replace with instrumented version
    proto[methodName] = function (this: object, ...args: unknown[]): unknown {
      // Check if we're already inside an invoke_agent span (to detect internal calls)
      const activeSpan = getActiveSpan();
      const isAlreadyInInvokeAgent =
        activeSpan && spanToJSON(activeSpan).op === `gen_ai.${DEFAULT_INVOKE_AGENT_OPERATION}`;

      if (isAlreadyInInvokeAgent) {
        return originalMethod.apply(this, args);
      }

      const agentName = this.constructor.name;
      const spanName = `${agentName}.${methodName}`;

      return startSpan(
        {
          name: spanName,
          op: `gen_ai.${DEFAULT_INVOKE_AGENT_OPERATION}`,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: CLOUDFLARE_AGENTS_ORIGIN,
            [GEN_AI_SYSTEM_ATTRIBUTE]: CLOUDFLARE_AGENTS_SYSTEM,
            [GEN_AI_OPERATION_NAME_ATTRIBUTE]: DEFAULT_INVOKE_AGENT_OPERATION,
            [GEN_AI_OPERATION_TYPE_ATTRIBUTE]: 'agent',
            [GEN_AI_AGENT_NAME_ATTRIBUTE]: agentName,
          },
        },
        (span: Span) => {
          // Record inputs based on entry point type
          if (shouldRecordInputs && args.length > 0) {
            try {
              if (methodName === 'onMessage') {
                // onMessage(connection, message)
                // args[0] = connection, args[1] = message (string or ArrayBuffer)
                const message = args[1];
                recordMessageInput(span, message);
              } else if (methodName === 'onRequest') {
                // onRequest(request: Request)
                const request = args[0] as Request;
                recordRequestInput(span, request);
              } else {
                // For @callable methods and onConnect, record arguments as gen_ai.input.messages
                span.setAttribute(
                  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
                  JSON.stringify([
                    { role: 'user', parts: [{ type: 'text', content: _INTERNAL_getTruncatedJsonString(args) }] },
                  ]),
                );
              }
            } catch {
              // Ignore serialization errors
            }
          }

          const result = originalMethod.apply(this, args);

          // Handle async results
          if (isThenable(result)) {
            return Promise.resolve(result).then((resolved: unknown) => {
              if (shouldRecordOutputs) {
                recordOutputMessages(span, resolved);
              }
              return resolved;
            });
          }

          // Handle sync results
          if (shouldRecordOutputs) {
            recordOutputMessages(span, result);
          }
          return result;
        },
      );
    };
  }
}

/**
 * Records WebSocket message input
 */
function recordMessageInput(span: Span, message: unknown): void {
  try {
    let messageContent: string;

    if (typeof message === 'string') {
      messageContent = message;
    } else if (message instanceof ArrayBuffer) {
      messageContent = `<ArrayBuffer length=${message.byteLength}>`;
    } else {
      messageContent = _INTERNAL_getTruncatedJsonString(message);
    }

    span.setAttribute(
      GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
      JSON.stringify([{ role: 'user', parts: [{ type: 'text', content: messageContent }] }]),
    );
  } catch {
    // Ignore serialization errors
  }
}

/**
 * Records HTTP request input
 * Note: HTTP attributes (method, url, etc.) are already set by the parent HTTP span,
 * so we only record the gen_ai.input.messages attribute here.
 */
function recordRequestInput(span: Span, request: Request): void {
  try {
    const url = new URL(request.url);

    // Record as gen_ai input
    const requestInfo = {
      method: request.method,
      path: url.pathname,
      query: url.search,
    };

    span.setAttribute(
      GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
      JSON.stringify([{ role: 'user', parts: [{ type: 'text', content: JSON.stringify(requestInfo) }] }]),
    );
  } catch {
    // Ignore serialization errors
  }
}

/**
 * Records the output using the standard gen_ai.output.messages attribute
 */
function recordOutputMessages(span: Span, result: unknown): void {
  try {
    // Skip Response objects - they don't serialize well and the actual AI output
    // is captured by child spans (e.g., OpenAI integration)
    // HTTP response status is already set by the parent HTTP span
    if (result && typeof result === 'object' && result instanceof Response) {
      return;
    }

    // Format as messages according to semantic conventions
    const outputMessages = [
      {
        role: 'assistant',
        parts: [
          {
            type: 'text',
            content: _INTERNAL_getTruncatedJsonString(result),
          },
        ],
      },
    ];
    span.setAttribute(GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE, JSON.stringify(outputMessages));
  } catch {
    // Ignore serialization errors
  }
}

export type { InstrumentCloudflareAgentsOptions } from './types';
