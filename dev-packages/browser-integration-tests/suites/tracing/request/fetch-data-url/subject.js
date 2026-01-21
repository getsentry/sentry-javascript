// Fetch a data URL to verify that the span name and attributes are sanitized
// Data URLs are used for inline resources, e.g., Web Workers with inline scripts
const dataUrl = 'data:text/plain;base64,SGVsbG8gV29ybGQh';
fetch(dataUrl).catch(() => {
  // Data URL fetch might fail in some browsers, but the span should still be created
});
