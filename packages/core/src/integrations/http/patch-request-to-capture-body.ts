import type { Scope } from "../../scope";
import { debug } from '../../utils/debug-logger';
import { DEBUG_BUILD } from '../../debug-build';
import type { HttpIncomingMessage } from "./types";

const MAX_BODY_BYTE_LENGTH = 1024 * 1024;

/**
 * This method patches the request object to capture the body.
 * Instead of actually consuming the streamed body ourselves, which has potential side effects,
 * we monkey patch `req.on('data')` to intercept the body chunks.
 * This way, we only read the body if the user also consumes the body, ensuring we do not change any behavior in unexpected ways.
 */
export function patchRequestToCaptureBody(
  req: HttpIncomingMessage,
  isolationScope: Scope,
  maxIncomingRequestBodySize: 'small' | 'medium' | 'always',
  integrationName: string,
): void {
  let bodyByteLength = 0;
  const chunks: Buffer[] = [];

  DEBUG_BUILD && debug.log(integrationName, 'Patching request.on');

  // keep track of the original callbacks to remove listeners later
  // `off` depends on having the exact same function reference passed in,
  // so we need to be able to map original listeners to our wrapped ones.
  const callbackMap = new WeakMap();

  const maxBodySize =
    maxIncomingRequestBodySize === 'small'
      ? 1_000
      : maxIncomingRequestBodySize === 'medium'
        ? 10_000
        : MAX_BODY_BYTE_LENGTH;

  try {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    req.on = req.addListener = new Proxy(req.on, {
      apply: (target, thisArg, args: Parameters<typeof req.on>) => {
        const [event, listener, ...restArgs] = args;

        if (event === 'data') {
          DEBUG_BUILD &&
            debug.log(integrationName, `Handling request.on("data") with maximum body size of ${maxBodySize}b`);

          const callback = new Proxy(listener, {
            apply: (target, thisArg, args: Parameters<typeof listener>) => {
              try {
                const chunk = args[0] as Buffer | string;
                const bufferifiedChunk = Buffer.from(chunk as string);

                if (bodyByteLength < maxBodySize) {
                  chunks.push(bufferifiedChunk);
                  bodyByteLength += bufferifiedChunk.byteLength;
                } else if (DEBUG_BUILD) {
                  debug.log(
                    integrationName,
                    `Dropping request body chunk because maximum body length of ${maxBodySize}b is exceeded.`,
                  );
                }
              } catch (_err) {
                DEBUG_BUILD && debug.error(integrationName, 'Encountered error while storing body chunk.');
              }

              return Reflect.apply(target, thisArg, args);
            },
          });

          callbackMap.set(listener, callback);

          return Reflect.apply(target, thisArg, [event, callback, ...restArgs]);
        }

        return Reflect.apply(target, thisArg, args);
      },
    });

    // Ensure we also remove callbacks correctly
    // eslint-disable-next-line @typescript-eslint/unbound-method
    req.off = req.removeListener = new Proxy(req.off, {
      apply: (target, thisArg, args: Parameters<typeof req.off>) => {
        const [, listener] = args;

        const callback = callbackMap.get(listener);
        if (callback) {
          callbackMap.delete(listener);

          const modifiedArgs = args.slice();
          modifiedArgs[1] = callback;
          return Reflect.apply(target, thisArg, modifiedArgs);
        }

        return Reflect.apply(target, thisArg, args);
      },
    });

    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        if (body) {
          // Using Buffer.byteLength here, because the body may contain characters that are not 1 byte long
          const bodyByteLength = Buffer.byteLength(body, 'utf-8');
          const truncatedBody =
            bodyByteLength > maxBodySize
              ? `${Buffer.from(body)
                  .subarray(0, maxBodySize - 3)
                  .toString('utf-8')}...`
              : body;

          isolationScope.setSDKProcessingMetadata({ normalizedRequest: { data: truncatedBody } });
        }
      } catch (error) {
        if (DEBUG_BUILD) {
          debug.error(integrationName, 'Error building captured request body', error);
        }
      }
    });
  } catch (error) {
    if (DEBUG_BUILD) {
      debug.error(integrationName, 'Error patching request to capture body', error);
    }
  }
}
