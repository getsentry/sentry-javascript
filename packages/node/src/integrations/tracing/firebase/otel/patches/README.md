# IPv6 Address Parsing Bug Fix

## Problem Description

The `setPortAndAddress` function incorrectly parsed IPv6 host strings when they started with `[` but lacked a `]:` port separator. The original implementation incorrectly assumed an `[address]:port` format and used `lastIndexOf(':')` to split the string, which led to IPv6 addresses being truncated at internal colons.

### Example of the Bug

**Input:** `[2001:db8::1]` (IPv6 address without port)

**Broken behavior:**
- `server.address` = `"[2001:db8:"` (truncated!)
- `server.port` = `1` (incorrectly parsed from `::1]`)

**Expected behavior:**
- `server.address` = `"2001:db8::1"` (complete address)
- `server.port` = `undefined` (no port specified)

## Solution

The fix implements proper IPv6 address parsing logic:

1. **IPv6 Detection**: Check if the host string starts with `[`
2. **Bracket Parsing**: Find the closing `]` bracket to extract the IPv6 address
3. **Port Detection**: Only look for `:port` **after** the closing bracket
4. **Graceful Fallback**: Handle malformed addresses appropriately

### Key Changes

- Replace `lastIndexOf(':')` with proper bracket-aware parsing for IPv6
- Extract IPv6 address content without brackets for `server.address`
- Only parse port when there's a valid `]:port` pattern
- Maintain backward compatibility for IPv4 and hostname parsing

## Files Modified

- `firestore.ts` - Main implementation with the fix
- `firestore.test.ts` - Comprehensive test suite
- `demo.ts` - Before/after demonstration
- Test scripts to verify the fix works correctly

## Test Results

All test cases pass:
- ✅ IPv6 without port (the problematic case)
- ✅ IPv6 with port 
- ✅ IPv6 localhost variants
- ✅ IPv4 addresses with/without port
- ✅ Hostnames with/without port
- ✅ Edge cases (malformed input, invalid ports)

## Impact

This fix ensures that IPv6 addresses are correctly preserved in span attributes, preventing data loss and improving observability for applications using IPv6 networking.
