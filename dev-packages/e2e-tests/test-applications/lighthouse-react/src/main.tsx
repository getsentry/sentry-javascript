import { createRoot } from 'react-dom/client';
import App from './App';

async function bootstrap() {
  const mode = import.meta.env.MODE;
  if (mode === 'init-only') {
    const { initSentry } = await import('./sentry/init-only');
    initSentry();
  } else if (mode === 'tracing-replay') {
    const { initSentry } = await import('./sentry/tracing-replay');
    initSentry();
  }
  // 'no-sentry' mode: do not import any sentry module — the dynamic-import
  // branches above are unreachable and Vite drops them from the bundle.

  const root = createRoot(document.getElementById('root')!);
  root.render(<App />);
}

void bootstrap();
