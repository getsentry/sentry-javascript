import { isObjectLike } from '@sentry/core';

interface OpenAiPromise {
  parseResponse: (...args: unknown[]) => unknown;
  asResponse: () => Promise<Response>;
  _thenUnwrap?: (...args: unknown[]) => OpenAiPromise;
}

export function onOpenAiResponse(
  result: unknown,
  onResponse: (response: unknown) => void,
  onError: (error: unknown) => void,
): boolean {
  if (!isObjectLike(result) || typeof result.parseResponse !== 'function' || typeof result.asResponse !== 'function') {
    return false;
  }

  const promise = result as unknown as OpenAiPromise;
  let parsing = false;

  // Transport failures reject before parseResponse is called. asResponse does not consume the body.
  void promise.asResponse().then(undefined, onError);

  // _thenUnwrap calls the original promise's parser, bypassing its cached parse() method.
  promise.parseResponse = new Proxy(promise.parseResponse, {
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

  function wrapRawResponse(apiPromise: OpenAiPromise): void {
    apiPromise.asResponse = new Proxy(apiPromise.asResponse, {
      apply(original, thisArg, args): Promise<Response> {
        return (Reflect.apply(original, thisArg, args) as Promise<Response>).then(response => {
          // withResponse also calls asResponse, but its parser owns the span's completion.
          if (!parsing) {
            onResponse(undefined);
          }
          return response;
        });
      },
    });

    const thenUnwrap = apiPromise._thenUnwrap;
    if (thenUnwrap) {
      apiPromise._thenUnwrap = new Proxy(thenUnwrap, {
        apply(original, thisArg, args): OpenAiPromise {
          const derivedPromise = Reflect.apply(original, thisArg, args);
          wrapRawResponse(derivedPromise);
          return derivedPromise;
        },
      });
    }
  }

  wrapRawResponse(promise);

  return true;
}
