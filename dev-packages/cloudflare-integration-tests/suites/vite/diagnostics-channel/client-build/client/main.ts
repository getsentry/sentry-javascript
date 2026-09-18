import { streamText } from 'ai';

// The browser bundle also pulls in an orchestrion-instrumented module (`ai`).
// Injected `node:diagnostics_channel` calls only exist server-side, so the
// client bundle must stay free of them (they throw `X is not a function` in
// the browser otherwise).
document.title = `streamText: ${typeof streamText}`;
