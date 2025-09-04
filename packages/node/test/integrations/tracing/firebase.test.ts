import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPortAndAddress } from '../../../src/integrations/tracing/firebase/otel/patches/firestore';

describe('setPortAndAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('IPv6 addresses', () => {
    it('should correctly parse IPv6 address without port', () => {
      const { address, port } = getPortAndAddress({ host: '[2001:db8::1]' });

      expect(address).toBe('2001:db8::1');
      expect(port).toBeUndefined();
    });

    it('should correctly parse IPv6 address with port', () => {
      const { address, port } = getPortAndAddress({ host: '[2001:db8::1]:8080' });
      expect(address).toBe('2001:db8::1');
      expect(port).toBe(8080);
    });

    it('should handle IPv6 localhost without port', () => {
      const { address, port } = getPortAndAddress({ host: '[::1]' });

      expect(address).toBe('::1');
      expect(port).toBeUndefined();
    });

    it('should handle IPv6 localhost with port', () => {
      const { address, port } = getPortAndAddress({ host: '[::1]:3000' });

      expect(address).toBe('::1');
      expect(port).toBe(3000);
    });
  });

  describe('IPv4 and hostname addresses', () => {
    it('should correctly parse IPv4 address with port', () => {
      const { address, port } = getPortAndAddress({ host: '192.168.1.1:8080' });

      expect(address).toBe('192.168.1.1');
      expect(port).toBe(8080);
    });

    it('should correctly parse hostname with port', () => {
      const { address, port } = getPortAndAddress({ host: 'localhost:3000' });

      expect(address).toBe('localhost');
      expect(port).toBe(3000);
    });

    it('should correctly parse hostname without port', () => {
      const { address, port } = getPortAndAddress({ host: 'example.com' });

      expect(address).toBe('example.com');
      expect(port).toBeUndefined();
    });

    it('should correctly parse hostname with port', () => {
      const { address, port } = getPortAndAddress({ host: 'example.com:4000' });

      expect(address).toBe('example.com');
      expect(port).toBe(4000);
    });

    it('should handle empty string', () => {
      const { address, port } = getPortAndAddress({ host: '' });

      expect(address).toBe('');
      expect(port).toBeUndefined();
    });
  });
});
