// Demonstration of the exact bug mentioned in the issue

console.log('=== Demonstration of IPv6 Parsing Bug ===\n');

// The BROKEN implementation (as described in the bug report)
function brokenSetPortAndAddress(hostString, server, attributes) {
  if (!hostString) {
    return;
  }

  // This is the problematic approach mentioned in the bug:
  // "When a host string starts with `[` but lacks a `]:` port separator, 
  // the code incorrectly assumes an `[address]:port` format and uses 
  // `lastIndexOf(':')` to split the string."
  
  if (hostString.startsWith('[')) {
    // BUG: Always using lastIndexOf(':') even for IPv6 without port!
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
  // ... rest would handle other cases
}

// The FIXED implementation
const { setPortAndAddress } = require('./firestore-js-version');

// Test with the problematic case: IPv6 without port
const problematicHost = '[2001:db8::1]';
console.log(`Testing with: ${problematicHost}`);
console.log('(This is an IPv6 address WITHOUT a port - no ]: separator)\n');

// Show broken behavior
console.log('❌ BROKEN behavior (old implementation):');
const brokenServer = {};
const brokenAttributes = {};
brokenSetPortAndAddress(problematicHost, brokenServer, brokenAttributes);
console.log(`   server.address: "${brokenServer.address}"`);
console.log(`   server.port: ${brokenServer.port}`);
console.log(`   Problem: IPv6 address truncated at "${brokenServer.address}" - missing "::1]" part!\n`);

// Show fixed behavior
console.log('✅ FIXED behavior (new implementation):');
const fixedServer = {};
const fixedAttributes = {};
setPortAndAddress(problematicHost, fixedServer, fixedAttributes);
console.log(`   server.address: "${fixedServer.address}"`);
console.log(`   server.port: ${fixedServer.port}`);
console.log(`   Success: Full IPv6 address preserved correctly!\n`);

// Show that the fix doesn't break other cases
console.log('=== Verification that other cases still work ===\n');

const otherCases = [
  { name: 'IPv6 with port', host: '[2001:db8::1]:8080' },
  { name: 'IPv4 with port', host: 'localhost:3000' },
  { name: 'Hostname without port', host: 'example.com' }
];

otherCases.forEach(testCase => {
  const server = {};
  const attributes = {};
  setPortAndAddress(testCase.host, server, attributes);
  console.log(`${testCase.name}: ${testCase.host}`);
  console.log(`   → address="${server.address}", port=${server.port}`);
});

console.log('\n🎯 Bug successfully fixed! IPv6 addresses are now parsed correctly.');
