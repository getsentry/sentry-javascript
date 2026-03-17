// Simulates a microfrontend architecture where MFEs are lazy-loaded

// Lazy-load each MFE (kinda like React.lazy + Module Federation)
import('./mfe-header').then(m => m.mount());
import('./mfe-one').then(m => m.mount());
import('./mfe-two').then(m => m.mount());

// Shell makes its own request, no MFE scope
fetch('http://sentry-test-site.example/api/shell-config');
