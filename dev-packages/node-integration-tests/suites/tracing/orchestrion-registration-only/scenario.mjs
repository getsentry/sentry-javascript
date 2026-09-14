// `mysql2` >= 3.20 has a registration-only orchestrion config (its tracing
// channels are native, so orchestrion doesn't wrap it — it only splices a
// module-registration snippet). Requiring `mysql2` loads its instrumented file
// (`lib/base/connection.js`), which drives the runtime module hook to transform
// it.
//
// The registration-only transform is wired into the bundler plugins only, so
// before the runtime instrumentation set excluded these configs, the runtime
// hook threw `TypeError: transform is not a function`, which the loader turned
// into an always-on "`@sentry/server-runtime-injection` was bundled ..." warning
// on stderr. `ensureNoErrorOutput` fails the test if that warning (or anything
// else) reaches stderr.
//
// A bare `import` is service-free — it never connects to a database.
await import('mysql2');
