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

function longestPartialTagSuffix(text: string): number {
  for (let length = Math.min(HEAD_CLOSING_TAG.length - 1, text.length); length > 0; length--) {
    if (text.endsWith(HEAD_CLOSING_TAG.slice(0, length))) {
      return length;
    }
  }
  return 0;
}
