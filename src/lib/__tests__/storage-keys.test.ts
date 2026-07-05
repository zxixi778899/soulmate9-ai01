import { describe, it, expect } from 'vitest';
import { getStorageItem, setStorageItem, removeStorageItem, StorageKeys } from '../storage-keys';

describe('StorageKeys', () => {
  it('exports all expected keys', () => {
    expect(StorageKeys.locale).toBeTruthy();
    expect(StorageKeys.onboardingVersion).toBeTruthy();
    expect(StorageKeys.anonymousId).toBeTruthy();
    expect(StorageKeys.theme).toBeTruthy();
    expect(StorageKeys.lastVisitedGirlfriend).toBeTruthy();
  });

  it('uses soulmate9: prefix to avoid collision', () => {
    Object.values(StorageKeys).forEach((k) => {
      expect(k).toMatch(/^soulmate9:/);
    });
  });
});

describe('storage helpers (SSR-safe)', () => {
  it('getStorageItem returns null in SSR', () => {
    expect(getStorageItem(StorageKeys.locale)).toBeNull();
  });

  it('setStorageItem is no-op in SSR (does not throw)', () => {
    expect(() => setStorageItem(StorageKeys.locale, 'en')).not.toThrow();
  });

  it('removeStorageItem is no-op in SSR (does not throw)', () => {
    expect(() => removeStorageItem(StorageKeys.locale)).not.toThrow();
  });
});