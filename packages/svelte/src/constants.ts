// TODO: we might want to call this ui.svelte.init instead because
// it doesn't only track mounting time (there's no before-/afterMount)
// but component init to mount time.
export const UI_SVELTE_MOUNT = 'ui.svelte.mount';

export const UI_SVELTE_UPDATE = 'ui.svelte.update';

export const DEFAULT_COMPONENT_NAME = 'Svelte Component';
