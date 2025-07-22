/**
 * Correctly parses host strings to extract port and address, handling IPv6 addresses properly.
 * 
 * This function fixes the bug where IPv6 host strings starting with '[' but lacking a ']:' port 
 * separator were incorrectly parsed using lastIndexOf(':'), which would split IPv6 addresses 
 * at internal colons rather than properly identifying the port separator.
 */
function setPortAndAddress(hostString, server, attributes) {
  if (!hostString) {
    return;
  }

  // Handle IPv6 addresses properly
  if (hostString.startsWith('[')) {
    // Check if it's in the format [address]:port
    const bracketCloseIndex = hostString.indexOf(']');
    if (bracketCloseIndex === -1) {
      // Malformed IPv6 address, no closing bracket
      server.address = hostString;
      return;
    }

    const afterBracket = hostString.substring(bracketCloseIndex + 1);
    
    if (afterBracket.startsWith(':')) {
      // Format: [address]:port
      const portString = afterBracket.substring(1);
      const port = parseInt(portString, 10);
      
      if (!isNaN(port) && port > 0 && port <= 65535) {
        server.port = port;
        attributes['server.port'] = port;
      }
      
      // Extract IPv6 address without brackets for server.address
      server.address = hostString.substring(1, bracketCloseIndex);
      attributes['server.address'] = server.address;
    } else if (afterBracket === '') {
      // Format: [address] (no port)
      server.address = hostString.substring(1, bracketCloseIndex);
      attributes['server.address'] = server.address;
    } else {
      // Malformed format, treat entire string as address
      server.address = hostString;
      attributes['server.address'] = hostString;
    }
  } else {
    // Handle IPv4 addresses and hostnames
    const lastColonIndex = hostString.lastIndexOf(':');
    
    if (lastColonIndex > 0) {
      // Potentially has a port
      const potentialPort = hostString.substring(lastColonIndex + 1);
      const port = parseInt(potentialPort, 10);
      
      if (!isNaN(port) && port > 0 && port <= 65535) {
        // Valid port found
        server.port = port;
        attributes['server.port'] = port;
        server.address = hostString.substring(0, lastColonIndex);
        attributes['server.address'] = server.address;
      } else {
        // Not a valid port, treat entire string as address
        server.address = hostString;
        attributes['server.address'] = hostString;
      }
    } else {
      // No colon found, entire string is the address
      server.address = hostString;
      attributes['server.address'] = hostString;
    }
  }
}

module.exports = { setPortAndAddress };
