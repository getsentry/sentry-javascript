<script setup>
import { defineProps } from 'vue';

const props = defineProps({
  errorText: {
    type: String,
    required: true
  }
})

const triggerError = () => {
  throw new Error(props.errorText);
};
</script>

<template>
  <button id="errorBtn" @click="triggerError">Trigger Error</button>
</template>
