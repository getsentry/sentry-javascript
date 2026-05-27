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
export function isVueViewModel(wat: unknown): wat is VueViewModel | VNode {
  return !!(
    typeof wat === 'object' &&
    wat !== null &&
    ((wat as VueViewModel).__isVue || (wat as VueViewModel)._isVue || (wat as { __v_isVNode?: boolean }).__v_isVNode)
  );
}
