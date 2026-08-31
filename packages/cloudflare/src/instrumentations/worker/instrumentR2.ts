import type { R2Bucket, R2ListOptions, R2MultipartUpload } from '@cloudflare/workers-types';
import {
  CLOUDFLARE_R2_BUCKET,
  CLOUDFLARE_R2_OPERATION,
  CLOUDFLARE_R2_REQUEST_DELIMITER,
  CLOUDFLARE_R2_REQUEST_KEY,
  CLOUDFLARE_R2_REQUEST_PART_NUMBER,
  CLOUDFLARE_R2_REQUEST_PREFIX,
  SENTRY_OP,
} from '@sentry/conventions/attributes';
import {
  OBJECT_DELETE,
  OBJECT_GET,
  OBJECT_HEAD,
  OBJECT_LIST,
  OBJECT_MULTIPART_UPLOAD_ABORT,
  OBJECT_MULTIPART_UPLOAD_COMPLETE,
  OBJECT_MULTIPART_UPLOAD_CREATE,
  OBJECT_PUT,
  OBJECT_UPLOAD_PART,
} from '@sentry/conventions/op';
import { isObjectLike, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/core';

const ORIGIN = 'auto.faas.cloudflare.r2';

const R2_OPERATIONS = {
  get: { spanName: 'r2_get', op: OBJECT_GET, operation: 'GetObject' },
  head: { spanName: 'r2_head', op: OBJECT_HEAD, operation: 'HeadObject' },
  put: { spanName: 'r2_put', op: OBJECT_PUT, operation: 'PutObject' },
  delete: { spanName: 'r2_delete', op: OBJECT_DELETE, operation: 'DeleteObject' },
  list: { spanName: 'r2_list', op: OBJECT_LIST, operation: 'ListObjects' },
  uploadPart: { spanName: 'r2_uploadPart', op: OBJECT_UPLOAD_PART, operation: 'UploadPart' },
  abortMultipartUpload: {
    spanName: 'r2_abortMultipartUpload',
    op: OBJECT_MULTIPART_UPLOAD_ABORT,
    operation: 'AbortMultipartUpload',
  },
  createMultipartUpload: {
    spanName: 'r2_createMultipartUpload',
    op: OBJECT_MULTIPART_UPLOAD_CREATE,
    operation: 'CreateMultipartUpload',
  },
  completeMultipartUpload: {
    spanName: 'r2_completeMultipartUpload',
    op: OBJECT_MULTIPART_UPLOAD_COMPLETE,
    operation: 'CompleteMultipartUpload',
  },
} as const;

type R2OperationKey = keyof typeof R2_OPERATIONS;

function isR2ListOptions(key: unknown): key is R2ListOptions {
  return isObjectLike(key) && !Array.isArray(key);
}

function createSpanOptions(bindingName: string, r2Op: R2OperationKey, key?: string | string[] | R2ListOptions) {
  const { spanName, op, operation } = R2_OPERATIONS[r2Op];
  const requestKey = Array.isArray(key) ? key.join(', ') : typeof key === 'string' ? key : undefined;

  return {
    name: spanName,
    attributes: {
      [CLOUDFLARE_R2_OPERATION]: operation,
      [CLOUDFLARE_R2_BUCKET]: bindingName,
      ...(requestKey !== undefined && { [CLOUDFLARE_R2_REQUEST_KEY]: requestKey }),
      ...(isR2ListOptions(key) && key.prefix !== undefined && { [CLOUDFLARE_R2_REQUEST_PREFIX]: key.prefix }),
      ...(isR2ListOptions(key) && key.delimiter !== undefined && { [CLOUDFLARE_R2_REQUEST_DELIMITER]: key.delimiter }),
      [SENTRY_OP]: op,
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
          const spanOptions = createSpanOptions(bindingName, 'uploadPart', key);

          return startSpan(
            {
              ...spanOptions,
              attributes: {
                ...spanOptions.attributes,
                [CLOUDFLARE_R2_REQUEST_PART_NUMBER]: partNumber,
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
