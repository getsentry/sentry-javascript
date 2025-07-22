// Simple test to demonstrate the IPv6 parsing fix without complex Jest setup

// Simulated types for the test
const setPortAndAddress = require('./firestore-js-version').setPortAndAddress;

function runTests() {
  console.log('=== IPv6 Parsing Bug Fix Test Results ===\n');

  const testCases = [
    {
      name: 'IPv6 without port (the problematic case)',
      input: '[2001:db8::1]',
      expectedAddress: '2001:db8::1',
      expectedPort: undefined
    },
    {
      name: 'IPv6 with port',
      input: '[2001:db8::1]:8080',
      expectedAddress: '2001:db8::1',
      expectedPort: 8080
    },
    {
      name: 'IPv6 localhost without port',
      input: '[::1]',
      expectedAddress: '::1',
      expectedPort: undefined
    },
    {
      name: 'IPv6 localhost with port',
      input: '[::1]:3000',
      expectedAddress: '::1',
      expectedPort: 3000
    },
    {
      name: 'IPv4 with port',
      input: '192.168.1.1:8080',
      expectedAddress: '192.168.1.1',
      expectedPort: 8080
    },
    {
      name: 'Hostname with port',
      input: 'localhost:3000',
      expectedAddress: 'localhost',
      expectedPort: 3000
    },
    {
      name: 'Hostname without port',
      input: 'example.com',
      expectedAddress: 'example.com',
      expectedPort: undefined
    }
  ];

  let passed = 0;
  let failed = 0;

  testCases.forEach(testCase => {
    const server = {};
    const attributes = {};
    
    setPortAndAddress(testCase.input, server, attributes);
    
    const addressMatches = server.address === testCase.expectedAddress;
    const portMatches = server.port === testCase.expectedPort;
    const attributeAddressMatches = attributes['server.address'] === testCase.expectedAddress;
    const attributePortMatches = attributes['server.port'] === testCase.expectedPort;
    
    const success = addressMatches && portMatches && attributeAddressMatches && attributePortMatches;
    
    if (success) {
      console.log(`✅ ${testCase.name}`);
      console.log(`   Input: ${testCase.input}`);
      console.log(`   Result: address="${server.address}", port=${server.port}`);
      passed++;
    } else {
      console.log(`❌ ${testCase.name}`);
      console.log(`   Input: ${testCase.input}`);
      console.log(`   Expected: address="${testCase.expectedAddress}", port=${testCase.expectedPort}`);
      console.log(`   Got: address="${server.address}", port=${server.port}`);
      console.log(`   Attributes: address="${attributes['server.address']}", port=${attributes['server.port']}`);
      failed++;
    }
    console.log('');
  });

  console.log(`\n=== Test Summary ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! The IPv6 parsing bug has been fixed.');
  } else {
    console.log('\n💥 Some tests failed. Please check the implementation.');
  }
}

runTests();
