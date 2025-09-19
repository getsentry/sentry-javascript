import { defineEventHandler } from '#imports';

export default defineEventHandler(async () => {
  const data = await $fetch('https://ungh.cc/orgs/unjs/repos');

  return data;
});
