import { TransactionMetadata } from './transaction';

/**
 * Holds meta information to customize the behavior of sentry's event processing.
 **/
export type DebugMeta = {
  images?: Array<DebugImage>;
} & TransactionMetadata;

/**
 * Possible choices for debug images.
 */
export type DebugImageType = 'wasm' | 'macho' | 'elf' | 'pe';

/**
 * References to debug images.
 */
export interface DebugImage {
  type: DebugImageType;
  debug_id: string;
  code_id?: string | null;
  code_file: string;
  debug_file?: string | null;
}
