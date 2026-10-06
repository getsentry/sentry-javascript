import { defineNuxtModule } from 'nuxt/kit';

// Just a fake module to check if the SDK works alongside other local Nuxt modules without breaking the build
export default defineNuxtModule({
  meta: { name: 'another-module' },
  setup() {
    console.log('another-module setup called');
  },
});
