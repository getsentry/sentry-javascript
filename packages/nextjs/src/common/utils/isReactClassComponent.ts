import type { ClassComponent } from '../types';

/**
 * Identifies whether `target` is a React Class Component.
 */
export function isReactClassComponent(target: unknown): target is ClassComponent {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return typeof target === 'function' && target?.prototype?.isReactComponent;
}
