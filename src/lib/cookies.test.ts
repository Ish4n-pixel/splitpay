import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setCookie,
  getCookie,
  deleteCookie,
  getUserProfile,
  saveUserProfile,
  getRecentTables,
  saveRecentTable,
  removeRecentTable,
  clearRecentTables,
} from './cookies';

describe('Cookies & Persistence System', () => {
  let mockCookies = '';
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockCookies = '';
    mockStorage = {};

    // Mock document.cookie
    Object.defineProperty(global, 'document', {
      value: {
        get cookie() {
          return mockCookies;
        },
        set cookie(val: string) {
          const parts = val.split(';')[0];
          const eqIdx = parts.indexOf('=');
          const k = parts.substring(0, eqIdx).trim();
          const v = parts.substring(eqIdx + 1);

          // Remove any existing cookie with key k
          const regex = new RegExp(`(?:^|; )${k}=[^;]*`);
          mockCookies = mockCookies.replace(regex, '').replace(/^; /, '').trim();

          if (!val.includes('max-age=0')) {
            if (mockCookies) {
              mockCookies += `; ${k}=${v}`;
            } else {
              mockCookies = `${k}=${v}`;
            }
          }
        },
      },
      configurable: true,
      writable: true,
    });

    // Mock localStorage
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: (k: string) => mockStorage[k] || null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = String(v);
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
        clear: () => {
          mockStorage = {};
        },
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    // @ts-ignore
    delete global.document;
    // @ts-ignore
    delete global.localStorage;
  });

  it('sets, retrieves, and deletes a cookie and syncs with storage', () => {
    setCookie('test_cookie', 'splitpay123');
    expect(getCookie('test_cookie')).toBe('splitpay123');
    expect(mockStorage['test_cookie']).toBe('splitpay123');

    deleteCookie('test_cookie');
    expect(getCookie('test_cookie')).toBeNull();
    expect(mockStorage['test_cookie']).toBeUndefined();
  });

  it('saves and restores user profile (name, upiVpa, feeMode)', () => {
    saveUserProfile({
      name: 'Ishan Gupta',
      upiVpa: 'ishan@okhdfcbank',
      feeMode: 'equal',
    });

    const profile = getUserProfile();
    expect(profile.name).toBe('Ishan Gupta');
    expect(profile.upiVpa).toBe('ishan@okhdfcbank');
    expect(profile.feeMode).toBe('equal');
  });

  it('records, updates, and limits recent tables history', () => {
    saveRecentTable({
      code: 'TABLE1',
      title: 'Dinner at Social',
      role: 'host',
      joinedAt: 1000,
    });

    saveRecentTable({
      code: 'TABLE2',
      title: 'Lunch at Toit',
      role: 'diner',
      joinedAt: 2000,
    });

    let recent = getRecentTables();
    expect(recent.length).toBe(2);
    expect(recent[0].code).toBe('TABLE2');
    expect(recent[1].code).toBe('TABLE1');

    // Removing TABLE1
    removeRecentTable('TABLE1');
    recent = getRecentTables();
    expect(recent.length).toBe(1);
    expect(recent[0].code).toBe('TABLE2');

    // Clearing all
    clearRecentTables();
    expect(getRecentTables()).toEqual([]);
  });

  it('falls back to localStorage if document is empty', () => {
    mockCookies = '';
    mockStorage['splitpay_user_name'] = 'Fallback User';
    expect(getCookie('splitpay_user_name')).toBe('Fallback User');
  });
});
