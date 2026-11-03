import { isObjectLike } from '@sentry/core';

interface ApiPromise {
  parseResponse: (...args: unknown[]) => unknown;
  asResponse: () => Promise<Response>;
  _thenUnwrap?: (...args: unknown[]) => ApiPromise;
}

function isApiPromise(value: unknown): value is ApiPromise {
  return isObjectLike(value) && typeof value.parseResponse === 'function' && typeof value.asResponse === 'function';
}

// OpenAI and Anthropic return an APIPromise that extends the native promise objects and redefines .then() in a way that internally triggers body parsing.
// This can lead to double parsing if our instrumentation triggers .then on this promise.
// Instead, we need to avoid triggering .then on the APIPromise and instead observe the internal parsing process to get the response body.
// OpenAI APIPromise: https://github.com/openai/openai-node/blob/71d24120c4cc4e5897a767f16d25f2804fa4ad7c/src/core/api-promise.ts
// Anthropic APIPromise: https://github.com/anthropics/anthropic-sdk-typescript/blob/d49bdab458000bcdffe77bd84b03293f31824fb3/src/core/api-promise.ts
export function wrapApiPromiseResponse(
  result: unknown,
  onResponse: (response: unknown) => void,
  onError: (error: unknown) => void,
): boolean {
  // e.g. Anthropic's messages.stream() returns an emitter instead of an APIPromise
  if (!isApiPromise(result)) {
    return false;
  }

  let parsing = false;

  // observe internal parsing method on the APIPromise to read the response body
  result.parseResponse = new Proxy(result.parseResponse, {
    async apply(original, thisArg, args): Promise<unknown> {
      parsing = true;
      try {
        const response = await Reflect.apply(original, thisArg, args);
        onResponse(response);
        return response;
      } catch (error) {
        onError(error);
        throw error;
      }
    },
  });

  // end the span in case of request failures before the internal parsing process is triggered
  void result.asResponse().then(undefined, onError);

  // asResponse() calls .then() on the native response promise, not on APIPromise so parseResponse never runs
  // therefore we need to handle this path separately
  function wrapRawResponse(apiPromise: ApiPromise): void {
    apiPromise.asResponse = new Proxy(apiPromise.asResponse, {
      apply(original, thisArg, args): Promise<Response> {
        return (Reflect.apply(original, thisArg, args) as Promise<Response>).then(response => {
          if (!parsing) {
            onResponse(undefined);
          }
          return response;
        });
      },
    });

    // thenUnwrap internally creates a new APIPromise
    // asResponse() on the derived promise would still be uninstrumented, so we need to recursively wrap the derived promises
    // thenUnwrap is for instance internally used by chat.completions.parse() / responses.parse()
    // so this would cover for instance responses.parse().asResponse() calls
    const thenUnwrap = apiPromise._thenUnwrap;
    if (thenUnwrap) {
      // parse(...).asResponse()
      apiPromise._thenUnwrap = new Proxy(thenUnwrap, {
        apply(original, thisArg, args): ApiPromise {
          const derivedPromise = Reflect.apply(original, thisArg, args);
          wrapRawResponse(derivedPromise);
          return derivedPromise;
        },
      });
    }
  }

  wrapRawResponse(result);

  return true;
}
