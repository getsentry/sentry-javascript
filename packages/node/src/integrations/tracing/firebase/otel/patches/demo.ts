// Demonstration of the IPv6 parsing bug fix

import { setPortAndAddress } from './firestore';
import type { Attributes } from '@opentelemetry/api';

interface ServerInfo {
  port?: number;
  address?: string;
}

// The BROKEN approach (what was happening before the fix)
function brokenSetPortAndAddress(hostString: string, server: ServerInfo, attributes: Attributes): void {
  if (!hostString) {
    return;
  }

  // This is the problematic code that was mentioned in the bug report
  if (hostString.startsWith('[')) {
    // INCORRECT: Always using lastIndexOf(':') even for IPv6 without port
    const lastColonIndex = hostString.lastIndexOf(':');
    if (lastColonIndex > 0) {
      const portString = hostString.substring(lastColonIndex + 1);
      const port = parseInt(portString, 10);
      
      if (!isNaN(port)) {
        server.port = port;
        attributes['server.port'] = port;
        // This incorrectly truncates the IPv6 address!
        server.address = hostString.substring(0, lastColonIndex);
        attributes['server.address'] = server.address;
      }
    }
  }
  // ... rest of the function would handle other cases
}

// Demonstration
console.log('=== IPv6 Parsing Bug Fix Demonstration ===\n');

// Test case: IPv6 address without port
const testHost = '[2001:db8::1]';
console.log(`Testing host string: ${testHost}\n`);

// Before fix (broken behavior)
const brokenServer: ServerInfo = {};
const brokenAttributes: Attributes = {};
brokenSetPortAndAddress(testHost, brokenServer, brokenAttributes);

console.log('BEFORE fix (broken behavior):');
console.log(`  server.address: "${brokenServer.address}"`);
console.log(`  server.port: ${brokenServer.port}`);
console.log(`  attributes['server.address']: "${brokenAttributes['server.address']}"`);
console.log(`  attributes['server.port']: ${brokenAttributes['server.port']}`);
console.log('  ^ PROBLEM: IPv6 address is truncated at the last colon!\n');

// After fix (correct behavior)
const fixedServer: ServerInfo = {};
const fixedAttributes: Attributes = {};
setPortAndAddress(testHost, fixedServer, fixedAttributes);

console.log('AFTER fix (correct behavior):');
console.log(`  server.address: "${fixedServer.address}"`);
console.log(`  server.port: ${fixedServer.port}`);
console.log(`  attributes['server.address']: "${fixedAttributes['server.address']}"`);
console.log(`  attributes['server.port']: ${fixedAttributes['server.port']}`);
console.log('  ^ FIXED: Full IPv6 address is preserved!\n');

// Additional test cases
console.log('=== Additional Test Cases ===\n');

const testCases = [
  '[::1]',              // IPv6 localhost without port
  '[::1]:3000',         // IPv6 localhost with port
  '[2001:db8::1]:8080', // IPv6 with port
  'localhost:3000',     // IPv4/hostname with port (should still work)
  'localhost',          // IPv4/hostname without port (should still work)
];

testCases.forEach(hostString => {
  const server: ServerInfo = {};
  const attributes: Attributes = {};
  setPortAndAddress(hostString, server, attributes);
  
  console.log(`Host: ${hostString}`);
  console.log(`  address: "${server.address}", port: ${server.port}`);
});

export {};
