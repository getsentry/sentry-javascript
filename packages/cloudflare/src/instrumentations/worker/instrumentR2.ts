import type { R2Bucket, R2ListOptions, R2MultipartUpload } from '@cloudflare/workers-types';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';

const ORIGIN = 'auto.faas.cloudflare.r2';

const R2_OPERATIONS = {
  get: { spanName: 'r2_get', operation: 'GetObject' },
  head: { spanName: 'r2_head', operation: 'HeadObject' },
  put: { spanName: 'r2_put', operation: 'PutObject' },
  delete: { spanName: 'r2_delete', operation: 'DeleteObject' },
  list: { spanName: 'r2_list', operation: 'ListObjects' },
  createMultipartUpload: { spanName: 'r2_createMultipartUpload', operation: 'CreateMultipartUpload' },
  uploadPart: { spanName: 'r2_uploadPart', operation: 'UploadPart' },
  abortMultipartUpload: { spanName: 'r2_abortMultipartUpload', operation: 'AbortMultipartUpload' },
  completeMultipartUpload: { spanName: 'r2_completeMultipartUpload', operation: 'CompleteMultipartUpload' },
} as const;

type R2OperationKey = keyof typeof R2_OPERATIONS;

function isR2ListOptions(key: unknown): key is R2ListOptions {
  return typeof key === 'object' && key !== null && !Array.isArray(key);
}

function createSpanOptions(bindingName: string, op: R2OperationKey, key?: string | string[] | R2ListOptions) {
  const { spanName, operation } = R2_OPERATIONS[op];
  const requestKey = Array.isArray(key) ? key.join(', ') : typeof key === 'string' ? key : undefined;

  return {
    op: 'cloud.r2',
    name: spanName,
    attributes: {
      'cloudflare.r2.operation': operation,
      'cloudflare.r2.bucket': bindingName,
      ...(requestKey !== undefined && { 'cloudflare.r2.request.key': requestKey }),
      ...(isR2ListOptions(key) && key.prefix !== undefined && { 'cloudflare.r2.request.prefix': key.prefix }),
      ...(isR2ListOptions(key) && key.delimiter !== undefined && { 'cloudflare.r2.request.delimiter': key.delimiter }),
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cloud.r2',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
    },
  };
}

function instrumentR2MultipartUpload(upload: R2MultipartUpload, bindingName: string): R2MultipartUpload {
  const { key } = upload;

  return new Proxy(upload, {
    get(target, prop, receiver) {
      if (prop === 'uploadPart') {
        const original = Reflect.get(target, prop, receiver);

        return function (this: unknown, ...args: Parameters<R2MultipartUpload['uploadPart']>) {
          const [partNumber] = args;

          return startSpan(
            {
              ...createSpanOptions(bindingName, 'uploadPart', key),
              attributes: {
                ...createSpanOptions(bindingName, 'uploadPart', key).attributes,
                'cloudflare.r2.request.part_number': partNumber,
              },
            },
            () => Reflect.apply(original, target, args),
          );
        };
      }

      if (prop === 'abort') {
        const original = Reflect.get(target, prop, receiver);

        return function (this: unknown) {
          return startSpan(createSpanOptions(bindingName, 'abortMultipartUpload', key), () =>
            Reflect.apply(original, target, []),
          );
        };
      }

      if (prop === 'complete') {
        const original = Reflect.get(target, prop, receiver);

        return function (this: unknown, ...args: Parameters<R2MultipartUpload['complete']>) {
          return startSpan(createSpanOptions(bindingName, 'completeMultipartUpload', key), () =>
            Reflect.apply(original, target, args),
          );
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Wraps a Cloudflare R2 Bucket binding to create spans on bucket operations.
 *
 * Instrumented methods: get, head, put, delete, list, createMultipartUpload,
 * resumeMultipartUpload (and the resulting multipart upload operations).
 */
export function instrumentR2Bucket<T extends R2Bucket>(bucket: T, bindingName: string): T {
  return new Proxy(bucket, {
    get(target, prop, receiver) {
      if (prop === 'get' || prop === 'head' || prop === 'put' || prop === 'delete' || prop === 'list') {
        const original = Reflect.get(target, prop, receiver);

        return function (this: unknown, ...args: Parameters<R2Bucket[typeof prop]>) {
          const [key] = args;

          return startSpan(createSpanOptions(bindingName, prop, key), () => Reflect.apply(original, target, args));
        };
      }

      if (prop === 'createMultipartUpload') {
        const original = Reflect.get(target, prop, receiver) as R2Bucket['createMultipartUpload'];

        return function (this: unknown, ...args: Parameters<R2Bucket['createMultipartUpload']>) {
          const [key] = args;

          return startSpan(createSpanOptions(bindingName, 'createMultipartUpload', key), async () => {
            const upload = await Reflect.apply(original, target, args);
            return instrumentR2MultipartUpload(upload, bindingName);
          });
        };
      }

      if (prop === 'resumeMultipartUpload') {
        const original = Reflect.get(target, prop, receiver);

        return function (this: unknown, ...args: Parameters<R2Bucket['resumeMultipartUpload']>) {
          const upload = Reflect.apply(original, target, args);

          return instrumentR2MultipartUpload(upload, bindingName);
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}
