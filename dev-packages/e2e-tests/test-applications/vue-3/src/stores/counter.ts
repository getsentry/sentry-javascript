import { defineStore } from 'pinia';

export const useCounterStore = defineStore('counter', {
  state: () => ({ name: 'Counter Store', count: 0 }),
  actions: {
    increment() {
      this.count++;
    },
  },
});
