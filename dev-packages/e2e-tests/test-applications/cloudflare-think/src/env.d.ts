declare namespace Cloudflare {
  interface Env {
    E2E_TEST_DSN: string;
    E2E_OPENROUTER_API_KEY: string;
    ThinkAgent: DurableObjectNamespace;
  }
}

interface Env extends Cloudflare.Env {}
