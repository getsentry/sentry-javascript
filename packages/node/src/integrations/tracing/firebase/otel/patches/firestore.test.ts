import { setPortAndAddress } from './firestore';
import type { Attributes } from '@opentelemetry/api';

interface ServerInfo {
  port?: number;
  address?: string;
}

describe('setPortAndAddress', () => {
  let server: ServerInfo;
  let attributes: Attributes;

  beforeEach(() => {
    server = {};
    attributes = {};
  });

  describe('IPv6 addresses', () => {
    it('should correctly parse IPv6 address without port', () => {
      // This was the problematic case mentioned in the bug
      setPortAndAddress('[2001:db8::1]', server, attributes);
      
      expect(server.address).toBe('2001:db8::1');
      expect(server.port).toBeUndefined();
      expect(attributes['server.address']).toBe('2001:db8::1');
      expect(attributes['server.port']).toBeUndefined();
    });

    it('should correctly parse IPv6 address with port', () => {
      setPortAndAddress('[2001:db8::1]:8080', server, attributes);
      
      expect(server.address).toBe('2001:db8::1');
      expect(server.port).toBe(8080);
      expect(attributes['server.address']).toBe('2001:db8::1');
      expect(attributes['server.port']).toBe(8080);
    });

    it('should handle IPv6 localhost without port', () => {
      setPortAndAddress('[::1]', server, attributes);
      
      expect(server.address).toBe('::1');
      expect(server.port).toBeUndefined();
      expect(attributes['server.address']).toBe('::1');
      expect(attributes['server.port']).toBeUndefined();
    });

    it('should handle IPv6 localhost with port', () => {
      setPortAndAddress('[::1]:3000', server, attributes);
      
      expect(server.address).toBe('::1');
      expect(server.port).toBe(3000);
      expect(attributes['server.address']).toBe('::1');
      expect(attributes['server.port']).toBe(3000);
    });

    it('should handle malformed IPv6 address (no closing bracket)', () => {
      setPortAndAddress('[2001:db8::1', server, attributes);
      
      expect(server.address).toBe('[2001:db8::1');
      expect(server.port).toBeUndefined();
    });

    it('should handle IPv6 with invalid port', () => {
      setPortAndAddress('[2001:db8::1]:invalid', server, attributes);
      
      expect(server.address).toBe('2001:db8::1');
      expect(server.port).toBeUndefined();
      expect(attributes['server.address']).toBe('2001:db8::1');
      expect(attributes['server.port']).toBeUndefined();
    });
  });

  describe('IPv4 and hostname addresses', () => {
    it('should correctly parse IPv4 address with port', () => {
      setPortAndAddress('192.168.1.1:8080', server, attributes);
      
      expect(server.address).toBe('192.168.1.1');
      expect(server.port).toBe(8080);
      expect(attributes['server.address']).toBe('192.168.1.1');
      expect(attributes['server.port']).toBe(8080);
    });

    it('should correctly parse hostname with port', () => {
      setPortAndAddress('localhost:3000', server, attributes);
      
      expect(server.address).toBe('localhost');
      expect(server.port).toBe(3000);
      expect(attributes['server.address']).toBe('localhost');
      expect(attributes['server.port']).toBe(3000);
    });

    it('should correctly parse hostname without port', () => {
      setPortAndAddress('example.com', server, attributes);
      
      expect(server.address).toBe('example.com');
      expect(server.port).toBeUndefined();
      expect(attributes['server.address']).toBe('example.com');
      expect(attributes['server.port']).toBeUndefined();
    });

    it('should handle hostname with invalid port', () => {
      setPortAndAddress('localhost:invalid', server, attributes);
      
      expect(server.address).toBe('localhost:invalid');
      expect(server.port).toBeUndefined();
      expect(attributes['server.address']).toBe('localhost:invalid');
      expect(attributes['server.port']).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      setPortAndAddress('', server, attributes);
      
      expect(server.address).toBeUndefined();
      expect(server.port).toBeUndefined();
    });

    it('should handle undefined input gracefully', () => {
      setPortAndAddress(undefined as any, server, attributes);
      
      expect(server.address).toBeUndefined();
      expect(server.port).toBeUndefined();
    });

    it('should handle port out of range', () => {
      setPortAndAddress('localhost:70000', server, attributes);
      
      expect(server.address).toBe('localhost:70000');
      expect(server.port).toBeUndefined();
      expect(attributes['server.address']).toBe('localhost:70000');
      expect(attributes['server.port']).toBeUndefined();
    });

    it('should handle zero port', () => {
      setPortAndAddress('localhost:0', server, attributes);
      
      expect(server.address).toBe('localhost:0');
      expect(server.port).toBeUndefined();
      expect(attributes['server.address']).toBe('localhost:0');
      expect(attributes['server.port']).toBeUndefined();
    });
  });
});
