import { FsInstrumentation } from '@opentelemetry/instrumentation-fs';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  addBreadcrumb,
  defineIntegration,
} from '@sentry/core';
import type { SpanAttributes } from '@sentry/types';
import { generateInstrumentOnce } from '../otel/instrument';

const INTEGRATION_NAME = 'FileSystem';

interface Options {
  /**
   * Whether to capture breadcrumbs for `fs` operations.
   *
   * Defaults to `true`.
   */
  breadcrumbs?: boolean;
  /**
   * Setting this option to `true` will include any filepath arguments from your `fs` API calls as span attributes.
   *
   * Defaults to `false`.
   */
  recordFilePaths?: boolean;

  /**
   * Setting this option to `true` will include the error messages of failed `fs` API calls as a span attribute.
   *
   * Defaults to `false`.
   */
  recordErrorMessagesAsSpanAttributes?: boolean;
}

/**
 * This integration will create spans for `fs` API operations, like reading and writing files.
 *
 * **WARNING:** This integration may add significant overhead to your application. Especially in scenarios with a lot of
 * file I/O, like for example when running a framework dev server, including this integration can massively slow down
 * your application.
 *
 * @param options Configuration for this integration.
 */
export const fsIntegration = defineIntegration((options: Options = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      generateInstrumentOnce(
        INTEGRATION_NAME,
        () =>
          new FsInstrumentation({
            requireParentSpan: true,
            endHook(functionName, { args, span, error }) {
              span.updateName(`fs.${functionName}`);

              const additionalAttributes = {
                ...(options.recordFilePaths && getFilePathAttributes(functionName, args)),
                ...(error && options.recordErrorMessagesAsSpanAttributes && { fs_error: error.message }),
              };

              span.setAttributes({
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'file',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.file.fs',
                ...additionalAttributes,
              });

              if (options.breadcrumbs !== false) {
                captureBreadcrumb(functionName, additionalAttributes, !!error);
              }
            },
          }),
      )();
    },
  };
});

const FS_OPERATIONS_WITH_OLD_PATH_NEW_PATH = ['rename', 'renameSync'];
const FS_OPERATIONS_WITH_SRC_DEST = ['copyFile', 'cp', 'copyFileSync', 'cpSync'];
const FS_OPERATIONS_WITH_EXISTING_PATH_NEW_PATH = ['link', 'linkSync'];
const FS_OPERATIONS_WITH_PREFIX = ['mkdtemp', 'mkdtempSync'];
const FS_OPERATIONS_WITH_TARGET_PATH = ['symlink', 'symlinkSync'];
const FS_OPERATIONS_WITH_PATH_ARG = [
  'access',
  'appendFile',
  'chmod',
  'chown',
  'exists',
  'mkdir',
  'lchown',
  'lstat',
  'lutimes',
  'open',
  'opendir',
  'readdir',
  'readFile',
  'readlink',
  'realpath',
  'realpath.native',
  'rm',
  'rmdir',
  'stat',
  'truncate',
  'unlink',
  'utimes',
  'writeFile',
  'accessSync',
  'appendFileSync',
  'chmodSync',
  'chownSync',
  'existsSync',
  'lchownSync',
  'lstatSync',
  'lutimesSync',
  'opendirSync',
  'mkdirSync',
  'openSync',
  'readdirSync',
  'readFileSync',
  'readlinkSync',
  'realpathSync',
  'realpathSync.native',
  'rmdirSync',
  'rmSync',
  'statSync',
  'truncateSync',
  'unlinkSync',
  'utimesSync',
  'writeFileSync',
];

function getFilePathAttributes(functionName: string, args: ArrayLike<unknown>): SpanAttributes {
  const attributes: SpanAttributes = {};

  if (typeof args[0] === 'string' && FS_OPERATIONS_WITH_PATH_ARG.includes(functionName)) {
    attributes['path_argument'] = args[0];
  } else if (
    typeof args[0] === 'string' &&
    typeof args[1] === 'string' &&
    FS_OPERATIONS_WITH_TARGET_PATH.includes(functionName)
  ) {
    attributes['target_argument'] = args[0];
    attributes['path_argument'] = args[1];
  } else if (typeof args[0] === 'string' && FS_OPERATIONS_WITH_PREFIX.includes(functionName)) {
    attributes['prefix_argument'] = args[0];
  } else if (
    typeof args[0] === 'string' &&
    typeof args[1] === 'string' &&
    FS_OPERATIONS_WITH_EXISTING_PATH_NEW_PATH.includes(functionName)
  ) {
    attributes['existing_path_argument'] = args[0];
    attributes['new_path_argument'] = args[1];
  } else if (
    typeof args[0] === 'string' &&
    typeof args[1] === 'string' &&
    FS_OPERATIONS_WITH_SRC_DEST.includes(functionName)
  ) {
    attributes['src_argument'] = args[0];
    attributes['dest_argument'] = args[1];
  } else if (
    typeof args[0] === 'string' &&
    typeof args[1] === 'string' &&
    FS_OPERATIONS_WITH_OLD_PATH_NEW_PATH.includes(functionName)
  ) {
    attributes['old_path_argument'] = args[0];
    attributes['new_path_argument'] = args[1];
  }

  return attributes;
}

function captureBreadcrumb(functionName: string, attributes: SpanAttributes | undefined, error: boolean): void {
  addBreadcrumb({
    message: `fs.${functionName}`,
    level: error ? 'error' : 'info',
    data: attributes,
  });
}
