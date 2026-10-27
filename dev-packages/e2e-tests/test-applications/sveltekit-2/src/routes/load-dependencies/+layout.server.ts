let layoutLoadCount = 0;

// Doesn't read `url`, so SvelteKit should only run it once across child navigations.
export const load = async () => {
  layoutLoadCount++;
  return { layoutLoadCount };
};
