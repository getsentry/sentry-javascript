// This is a shared module that is used by multiple HTML pages
export function greet(name) {
  // eslint-disable-next-line no-console
  console.log(`Hello, ${String(name)}!`);
}

export const VERSION = "1.0.0";

// Side effect: greet on load
greet("World");
