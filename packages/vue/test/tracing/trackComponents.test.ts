import { describe, expect, it } from 'vitest';
import { findTrackComponent } from '../../src/tracing';

describe('findTrackComponent', () => {
  describe('when user-defined array contains `<Component>`', () => {
    it('returns true if a match is found', () => {
      // arrange
      const trackComponents = ['<ABC>', '<XYZ>'];
      const formattedComponentName = '<XYZ>';

      // act
      const shouldTrack = findTrackComponent(trackComponents, formattedComponentName);

      // assert
      expect(shouldTrack).toBe(true);
    });
  });
  describe('when user-defined array contains `Component` without the `<>`', () => {
    it('returns true if a match is found', () => {
      // arrange
      const trackComponents = ['ABC', 'XYZ'];
      const formattedComponentName = '<XYZ>';

      // act
      const shouldTrack = findTrackComponent(trackComponents, formattedComponentName);

      // assert
      expect(shouldTrack).toBe(true);
    });
  });
  describe('when the vue file name is include in the formatted component name', () => {
    it('returns true if a match is found', () => {
      // arrange
      const trackComponents = ['ABC', 'XYZ'];
      const formattedComponentName = '<XYZ> at XYZ.vue';

      // act
      const shouldTrack = findTrackComponent(trackComponents, formattedComponentName);

      // assert
      expect(shouldTrack).toBe(true);
    });
  });
});
