import { isObjectLike, stringify } from '@sentry/core';
import type { Span } from '@sentry/core';
import { GEN_AI_OUTPUT_MESSAGES } from '@sentry/conventions/attributes';

// Copied from https://googleapis.github.io/js-genai/release_docs/index.html
export type ContentListUnion = Content | Content[] | PartListUnion;
export type ContentUnion = Content | PartUnion[] | PartUnion;
export type Content = {
  parts?: Part[];
  role?: string;
};
export type PartUnion = Part | string;
export type Part = Record<string, unknown> & {
  inlineData?: {
    data?: string;
    displayName?: string;
    mimeType?: string;
  };
  text?: string;
};
export type PartListUnion = PartUnion[] | PartUnion;

/**
 * A part of a `gen_ai.input.messages` / `gen_ai.output.messages` message, as described in
 * https://develop.sentry.dev/sdk/telemetry/traces/modules/ai-agents/. Google's own `Part` shape
 * (`{ text }`, `{ functionCall }`, ...) is not this shape and renders as nothing, so every part
 * has to be translated.
 */
export type MessagePart = Record<string, unknown> & { type: string };

export type Message = {
  role: string;
  parts: MessagePart[];
};

// `gen_ai` roles are `user`, `assistant`, `tool` and `system`; Google only ever emits `user` or `model`.
function normalizeRole(role: string): string {
  return role === 'model' ? 'assistant' : role;
}

function mimeTypeOf(value: Record<PropertyKey, unknown>): string | undefined {
  return typeof value.mimeType === 'string' ? value.mimeType : undefined;
}

/**
 * Translate a single Google `Part` into a `gen_ai` message part.
 *
 * Binary payloads are reported by media type only: `inlineData.data` is base64 bytes, which the
 * conventions require to be dropped rather than recorded.
 */
export function partToMessagePart(part: unknown): MessagePart | undefined {
  if (typeof part === 'string') {
    return { type: 'text', content: part };
  }

  if (!isObjectLike(part)) {
    return undefined;
  }

  if (typeof part.text === 'string') {
    return { type: part.thought === true ? 'reasoning' : 'text', content: part.text };
  }

  const { functionCall, functionResponse, inlineData, fileData } = part;

  if (isObjectLike(functionCall)) {
    return {
      type: 'tool_call',
      id: functionCall.id,
      name: functionCall.name,
      arguments: stringify(functionCall.args ?? {}, String),
    };
  }

  if (isObjectLike(functionResponse)) {
    return {
      type: 'tool_call_response',
      id: functionResponse.id,
      name: functionResponse.name,
      result: stringify(functionResponse.response ?? {}, String),
    };
  }

  if (isObjectLike(inlineData)) {
    return { type: 'blob', mime_type: mimeTypeOf(inlineData) };
  }

  if (isObjectLike(fileData)) {
    return { type: 'uri', mime_type: mimeTypeOf(fileData), uri: fileData.fileUri };
  }

  // Anything else (`executableCode`, `codeExecutionResult`, future part kinds) is reported verbatim
  // so it renders as JSON instead of disappearing.
  return { type: 'object', content: part };
}

function partsToMessageParts(parts: unknown): MessagePart[] {
  const list = Array.isArray(parts) ? parts : parts != null ? [parts] : [];
  return list.map(partToMessagePart).filter((part): part is MessagePart => part !== undefined);
}

function isContent(value: unknown): value is Content {
  return isObjectLike(value) && (typeof value.role === 'string' || Array.isArray(value.parts));
}

function contentToMessage(content: Content, role: string): Message {
  return {
    role: normalizeRole(typeof content.role === 'string' ? content.role : role),
    parts: partsToMessageParts(content.parts),
  };
}

/**
 * Convert anything the Google GenAI SDK accepts as content (`contents`, `history`, `message`,
 * `config.systemInstruction`) into `gen_ai` messages.
 *
 * Bare parts are collected into one message rather than one message each: `[{ text }, { inlineData }]`
 * is a single multimodal turn in Google's API, not two turns.
 */
export function contentUnionToMessages(content: ContentListUnion, role = 'user'): Message[] {
  if (Array.isArray(content)) {
    const messages: Message[] = [];
    let looseParts: MessagePart[] = [];

    const flushLooseParts = (): void => {
      if (looseParts.length) {
        messages.push({ role: normalizeRole(role), parts: looseParts });
        looseParts = [];
      }
    };

    for (const item of content) {
      if (isContent(item)) {
        flushLooseParts();
        const message = contentToMessage(item, role);
        if (message.parts.length) {
          messages.push(message);
        }
      } else {
        const part = partToMessagePart(item);
        if (part) {
          looseParts.push(part);
        }
      }
    }

    flushLooseParts();
    return messages;
  }

  if (isContent(content)) {
    const message = contentToMessage(content, role);
    return message.parts.length ? [message] : [];
  }

  const part = partToMessagePart(content);
  return part ? [{ role: normalizeRole(role), parts: [part] }] : [];
}

/**
 * Collect the `gen_ai` message parts of every candidate in a response.
 */
export function candidatesToMessageParts(candidates: unknown): MessagePart[] {
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates.flatMap(candidate =>
    isObjectLike(candidate) && isObjectLike(candidate.content)
      ? partsToMessageParts(candidate.content.parts as PartListUnion | undefined)
      : [],
  );
}

/**
 * Join runs of text (or reasoning) parts back into one part.
 *
 * A streamed response delivers its text a few characters at a time, so the parts collected across
 * chunks would otherwise be hundreds of one-word fragments.
 */
function mergeAdjacentTextParts(parts: MessagePart[]): MessagePart[] {
  const merged: MessagePart[] = [];

  for (const part of parts) {
    const previous = merged[merged.length - 1];
    const mergeable = part.type === 'text' || part.type === 'reasoning';

    if (mergeable && previous?.type === part.type && typeof previous.content === 'string') {
      previous.content += typeof part.content === 'string' ? part.content : '';
    } else {
      merged.push({ ...part });
    }
  }

  return merged;
}

/**
 * Write the model output as a single assistant message on `gen_ai.output.messages`.
 *
 * This is set in addition to the deprecated `gen_ai.response.text` / `gen_ai.response.tool_calls`
 * attributes because Sentry's product reads the model output from `gen_ai.output.messages` first.
 * Relay migrates `gen_ai.response.text` into `gen_ai.output.messages`, but the tool-calls half of
 * that migration is lossy, so a turn that only calls a tool would otherwise render an empty Output.
 */
export function setOutputMessagesAttribute(span: Span, parts: MessagePart[]): void {
  const merged = mergeAdjacentTextParts(parts);
  if (merged.length) {
    span.setAttribute(GEN_AI_OUTPUT_MESSAGES, JSON.stringify([{ role: 'assistant', parts: merged }]));
  }
}

/**
 * Flatten `config.systemInstruction` (a `ContentUnion`) into the plain text that
 * `gen_ai.system_instructions` expects.
 */
export function systemInstructionToText(systemInstruction: unknown): string | undefined {
  const texts = contentUnionToMessages(systemInstruction as ContentUnion, 'system')
    .flatMap(message => message.parts)
    .map(part => (part.type === 'text' && typeof part.content === 'string' ? part.content : ''))
    .filter(text => text.length > 0);

  return texts.length ? texts.join('\n') : undefined;
}
