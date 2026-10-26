/**
 * SplitPay Cookie & Local Storage Persistence System
 *
 * Provides long-term persistence (1 year) using browser cookies with dual-layer
 * fallback to localStorage. Ensures returning hosts and diners never have to
 * re-enter their profile data (Name, UPI ID, fee preferences) or lose their recent tables.
 */

export interface UserProfile {
  name: string;
  upiVpa: string;
  feeMode?: 'proportional' | 'equal';
}

export interface RecentTable {
  code: string;
  title?: string;
  role?: 'host' | 'diner';
  hostName?: string;
  joinedAt?: number;
  lastVisitedAt?: number;
}

const COOKIE_NAMES = {
  USER_NAME: 'splitpay_user_name',
  USER_UPI: 'splitpay_user_upi',
  FEE_MODE: 'splitpay_fee_mode',
  RECENT_TABLES: 'splitpay_recent_tables',
  GEMINI_KEY: 'splitpay_custom_gemini_key',
  PWA_DISMISSED: 'splitpay_pwa_dismissed',
} as const;

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * Sets a cookie in document.cookie with 1-year expiry, SameSite=Lax, path=/
 * Also syncs with localStorage for resilient fallback.
 */
export function setCookie(name: string, value: string, maxAgeSeconds = ONE_YEAR_SECONDS): void {
  if (typeof document === 'undefined') return;

  try {
    const encodedVal = encodeURIComponent(value);
    document.cookie = `${name}=${encodedVal}; max-age=${maxAgeSeconds}; path=/; SameSite=Lax`;
  } catch {
    // Ignore document.cookie write issues
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(name, value);
    }
  } catch {
    // Ignore localStorage write quota/restrictions
  }
}

/**
 * Retrieves a cookie value from document.cookie, falling back to localStorage.
 */
export function getCookie(name: string): string | null {
  if (typeof document !== 'undefined' && document.cookie) {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }

  // Fallback to localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(name);
    }
  } catch {
    // Ignore localStorage access issues
  }

  return null;
}

/**
 * Deletes a cookie and removes its localStorage key.
 */
export function deleteCookie(name: string): void {
  if (typeof document !== 'undefined') {
    document.cookie = `${name}=; max-age=0; path=/; SameSite=Lax`;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(name);
    }
  } catch {
    // Ignore
  }
}

/**
 * Retrieves the saved user profile from cookies.
 */
export function getUserProfile(): UserProfile {
  const name = getCookie(COOKIE_NAMES.USER_NAME) || '';
  const upiVpa = getCookie(COOKIE_NAMES.USER_UPI) || '';
  const rawFee = getCookie(COOKIE_NAMES.FEE_MODE);
  const feeMode = rawFee === 'equal' ? 'equal' : 'proportional';

  return { name, upiVpa, feeMode };
}

/**
 * Saves or updates user profile in cookies.
 */
export function saveUserProfile(profile: Partial<UserProfile>): void {
  if (profile.name !== undefined) {
    if (profile.name.trim()) {
      setCookie(COOKIE_NAMES.USER_NAME, profile.name.trim());
    }
  }
  if (profile.upiVpa !== undefined) {
    if (profile.upiVpa.trim()) {
      setCookie(COOKIE_NAMES.USER_UPI, profile.upiVpa.trim());
    }
  }
  if (profile.feeMode) {
    setCookie(COOKIE_NAMES.FEE_MODE, profile.feeMode);
  }
}

/**
 * Retrieves the list of recent tables visited or hosted by this device.
 * Sorted latest-first, capped at 6 tables.
 */
export function getRecentTables(): RecentTable[] {
  const raw = getCookie(COOKIE_NAMES.RECENT_TABLES);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t) => t && typeof t.code === 'string' && t.code.trim().length > 0)
      .sort((a, b) => (b.lastVisitedAt || 0) - (a.lastVisitedAt || 0))
      .slice(0, 6);
  } catch {
    return [];
  }
}

/**
 * Adds or updates a table in the recent tables history list.
 */
export function saveRecentTable(table: Partial<RecentTable> & { code: string }): void {
  const existing = getRecentTables();
  const now = Date.now();
  const code = table.code.toUpperCase().trim();

  const prev = existing.find((t) => t.code === code);
  const filtered = existing.filter((t) => t.code !== code);

  const updatedItem: RecentTable = {
    code,
    title: table.title || prev?.title || `${code} Dining Table`,
    role: table.role || prev?.role || 'diner',
    hostName: table.hostName || prev?.hostName,
    joinedAt: table.joinedAt || prev?.joinedAt || now,
    lastVisitedAt: now,
  };

  const updatedList = [updatedItem, ...filtered].slice(0, 6);
  setCookie(COOKIE_NAMES.RECENT_TABLES, JSON.stringify(updatedList));
}

/**
 * Removes a specific table from recent tables list.
 */
export function removeRecentTable(code: string): void {
  const existing = getRecentTables();
  const filtered = existing.filter((t) => t.code !== code.toUpperCase().trim());
  setCookie(COOKIE_NAMES.RECENT_TABLES, JSON.stringify(filtered));
}

/**
 * Clears all recent tables from cookies and storage.
 */
export function clearRecentTables(): void {
  deleteCookie(COOKIE_NAMES.RECENT_TABLES);
}
