import { normalizeStringifyValue as browserNormalizeStringifyValue } from '@sentry/browser';

interface VueViewModel {
  // Vue3
  __isVue?: boolean;
  // Vue2
  _isVue?: boolean;
}

interface VNode {
  // Vue3 — https://github.com/vuejs/core/blob/main/packages/runtime-core/src/vnode.ts
  __v_isVNode?: boolean;
}

/**
 * Checks whether the given value is a Vue ViewModel (Vue 2 / Vue 3 component
 * instance) or a Vue 3 `VNode`.
 *
 * The check is structural (not `instanceof`) because in Vue 3 the toString tag
 * would read a custom `Symbol.toStringTag`, and we want a cheap, runtime-safe
 * probe that works on either Vue version.
 */
function isVueViewModel(wat: unknown): wat is VueViewModel {
  return !!(typeof wat === 'object' && wat && ((wat as VueViewModel).__isVue || (wat as VueViewModel)._isVue));
}

/**
 * Checks whether the given value is a Vue ViewModel (Vue 2 / Vue 3 component
 * instance) or a Vue 3 `VNode`.
 *
 * The check is structural (not `instanceof`) because in Vue 3 the toString tag
 * would read a custom `Symbol.toStringTag`, and we want a cheap, runtime-safe
 * probe that works on either Vue version.
 */
function isVNode(wat: unknown): wat is VNode {
  return !!(typeof wat === 'object' && (wat as VNode | null)?.__v_isVNode);
}

export function normalizeStringifyValue(value: Exclude<unknown, string | number | boolean | null>): string | undefined {
  if (isVueViewModel(value)) {
    return '[VueViewModel]';
  }
  if (isVNode(value)) {
    return '[VueVNode]';
  }
  return browserNormalizeStringifyValue(value);
}
