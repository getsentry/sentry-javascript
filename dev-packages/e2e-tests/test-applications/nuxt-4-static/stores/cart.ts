import { acceptHMRUpdate, defineStore } from '#imports';

export const useCartStore = defineStore({
  id: 'cart',
  state: () => ({
    rawItems: [] as string[],
  }),
  getters: {
    items: (state): Array<{ name: string; amount: number }> =>
      state.rawItems.reduce(
        (items: any, item: any) => {
          const existingItem = items.find((it: any) => it.name === item);

          if (!existingItem) {
            items.push({ name: item, amount: 1 });
          } else {
            existingItem.amount++;
          }

          return items;
        },
        [] as Array<{ name: string; amount: number }>,
      ),
  },
  actions: {
    addItem(name: string) {
      this.rawItems.push(name);
    },

    removeItem(name: string) {
      const i = this.rawItems.lastIndexOf(name);
      if (i > -1) this.rawItems.splice(i, 1);
    },

    throwError() {
      throw new Error('error');
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCartStore, import.meta.hot));
}
