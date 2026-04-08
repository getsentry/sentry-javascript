import type { DurableObject, WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkerEntrypointConstructor } from '../instrumentations/instrumentWorkerEntrypoint';
type CloudflareClassName = 'WorkerEntrypoint' | 'DurableObject' | 'WorkflowEntrypoint';

/**
 * Checks if a class constructor extends a specific Cloudflare base class.
 *
 * Uses prototype chain walking with constructor names rather than instanceof,
 * so it works in Node at build time without requiring the cloudflare:workers
 * module (which only exists in the Workers runtime).
 *
 * This is used to differentiate between different Cloudflare worker types:
 * - WorkerEntrypoint: Class-based workers (used with instrumentWorkerEntrypoint)
 * - DurableObject: Durable Object classes
 * - Workflow: Workflow classes
 *
 * For ExportedHandler (plain objects), this will return false for all types.
 *
 * @param value - The value to check (typically a class constructor)
 * @param className - The Cloudflare base class name to check against
 * @returns true if the value is a class that extends the specified Cloudflare class
 *
 * @example
 * ```ts
 * isCloudflareClass(MyWorker, 'WorkerEntrypoint') // true if MyWorker extends WorkerEntrypoint
 * isCloudflareClass(MyDO, 'DurableObject') // true if MyDO extends DurableObject
 * ```
 */
export function isCloudflareClass(value: unknown, className: 'WorkerEntrypoint'): value is WorkerEntrypointConstructor;
export function isCloudflareClass(
  value: unknown,
  className: 'DurableObject',
): value is new (...args: unknown[]) => DurableObject;
export function isCloudflareClass(
  value: unknown,
  className: 'WorkflowEntrypoint',
): value is new (...args: unknown[]) => WorkflowEntrypoint;
export function isCloudflareClass(value: unknown, className: CloudflareClassName): boolean {
  if (!value || typeof value !== 'function') {
    return false;
  }

  if (value.name === className) {
    return false;
  }

  let proto: object | null = value.prototype;

  while (proto) {
    const ctor = (proto as { constructor?: { name?: string } }).constructor;
    const constructorName = ctor?.name;

    if (constructorName === className) {
      return true;
    }

    proto = Object.getPrototypeOf(proto);
  }

  return false;
}
