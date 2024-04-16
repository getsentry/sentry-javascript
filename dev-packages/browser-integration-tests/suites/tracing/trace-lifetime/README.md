Tests in this suite are meant to test the lifetime of a trace in the browser SDK and how different events sent are
connected to a trace. This suite distinguishes the following cases:

1. `pageload` - Traces started on the initial pageload as head of trace
2. `pageload-meta` - Traces started on the initial pageload as a continuation of the trace on the server (via `<meta>`
   tags)
3. `navigation` - Traces started during navigations on a page

Tests scenarios should be fairly similar for all three cases but it's important we test all of them.
