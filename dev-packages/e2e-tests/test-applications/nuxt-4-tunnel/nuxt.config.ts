export default defineNuxtConfig({
  compatibilityDate: '2025-06-06',
  modules: ['@sentry/nuxt/module'],
  app: { baseURL: '/app/' },
  // A headers rule on every path, like a security headers setup, also covers the tunnel's path.
  routeRules: { '/**': { headers: { 'x-e2e-route-rule': '1' } } },
  nitro:
    process.env.RUNTIME === 'cloudflare'
      ? {
          preset: 'cloudflare_module',
          cloudflare: { nodeCompat: true, deployConfig: false },
          // Cloudflare has no server config file, the SDK is set up by this plugin.
          plugins: ['~~/server/sentry-cloudflare.ts'],
        }
      : {},
});
