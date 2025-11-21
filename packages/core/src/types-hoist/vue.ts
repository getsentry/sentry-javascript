/**
 * Vue 2/3 VM type.
 */
export interface VueViewModel {
  // Vue3
  __isVue?: boolean;
  // Vue2
  _isVue?: boolean;
}

/**
 * Vue 3 VNode type.
 */
export interface VNode {
  // Vue3
  // https://github.com/vuejs/core/blob/main/packages/runtime-core/src/vnode.ts#L168
  __v_isVNode?: boolean;
}
