<template>
  <Layout>
    <div>
      <div style="margin: 1rem 0;">
        <PiniaLogo />
      </div>

      <form @submit.prevent="addItemToCart" data-testid="add-items">
        <input id="item-input" type="text" v-model="itemName" />
        <button id="item-add">Add</button>
        <button id="throw-error" @click="throwError">Throw error</button>
      </form>

      <form>
        <ul data-testid="items">
          <li v-for="item in cart.items" :key="item.name">
            {{ item.name }} ({{ item.amount }})
            <button
              @click="cart.removeItem(item.name)"
              type="button"
            >X</button>
          </li>
        </ul>

        <button
          :disabled="!cart.items.length"
          @click="clearCart"
          type="button"
          data-testid="clear"
        >Clear the cart</button>
      </form>
    </div>
  </Layout>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import { useCartStore } from '../stores/cart';

export default defineComponent({
  setup() {
    const cart = useCartStore();

    const itemName = ref('');

    function addItemToCart() {
      if (!itemName.value) return;
      cart.addItem(itemName.value);
      itemName.value = '';
    }

    function throwError() {
      throw new Error('This is an error');
    }

    function clearCart() {
      if (window.confirm('Are you sure you want to clear the cart?')) {
        cart.rawItems = [];
      }
    }

    // @ts-ignore
    window.stores = { cart };

    return {
      itemName,
      addItemToCart,
      cart,

      throwError,
      clearCart,
    };
  },
});
</script>

<style scoped>
img {
  width: 200px;
}

button,
input {
  margin-right: 0.5rem;
  margin-bottom: 0.5rem;
}
</style>
