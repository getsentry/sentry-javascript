const HEAD_CLOSING_TAG = '</head>';

/**
 * Injects `getTags()` before the first `</head>` of a string stream. Text that could be
 * the start of a `</head>` split across chunks is held back until the next push.
 */
export function createHeadTagInjector(getTags: () => string): { push(text: string): string; flush(): string } {
  let pending = '';
  let injected = false;

  return {
    push(text: string): string {
      if (injected) {
        return text;
      }

      pending += text;
      const index = pending.indexOf(HEAD_CLOSING_TAG);
      if (index !== -1) {
        injected = true;
        const out = `${pending.slice(0, index)}${getTags()}${HEAD_CLOSING_TAG}${pending.slice(index + HEAD_CLOSING_TAG.length)}`;
        pending = '';
        return out;
      }

      const holdLength = longestPartialTagSuffix(pending);
      const out = pending.slice(0, pending.length - holdLength);
      pending = pending.slice(pending.length - holdLength);
      return out;
    },

    flush(): string {
      const out = pending;
      pending = '';
      return out;
    },
  };
}

/**
 * Injects `tags` before the first `</head>` of an HTML `ReadableStream`.
 */
export function injectIntoHead(body: ReadableStream, tags: string): ReadableStream {
  const injector = createHeadTagInjector(() => tags);

  const reader = body.getReader();
  const encoder = new TextEncoder();
  // A single streaming decoder carries incomplete multi-byte sequences across chunk
  // boundaries. A fresh, non-streaming decoder per chunk would flush a split character
  // as U+FFFD, corrupting the response (see https://github.com/whatwg/encoding/issues/184).
  const decoder = new TextDecoder();

  // Not a TransformStream: workerd only supports a custom transformer from compatibility date
  // 2024-11-11, and Hydrogen's MiniOxygen runs with an older one.
  return new ReadableStream({
    async pull(controller) {
      // `pull` is not called again until a chunk is enqueued, so keep reading while text is held back.
      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          const rest = injector.push(decoder.decode()) + injector.flush();
          if (rest) {
            controller.enqueue(encoder.encode(rest));
          }
          controller.close();
          return;
        }

        const html = value instanceof Uint8Array ? decoder.decode(value, { stream: true }) : String(value);
        const out = injector.push(html);

        if (out) {
          controller.enqueue(encoder.encode(out));
          return;
        }
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

function longestPartialTagSuffix(text: string): number {
  for (let length = Math.min(HEAD_CLOSING_TAG.length - 1, text.length); length > 0; length--) {
    if (text.endsWith(HEAD_CLOSING_TAG.slice(0, length))) {
      return length;
    }
  }
  return 0;
}
