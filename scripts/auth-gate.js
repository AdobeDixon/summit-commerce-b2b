/**
 * Site-wide authentication gating for the MyCHEP B2B portal.
 *
 * Runs before any protected content is rendered. Unauthenticated users
 * attempting to access protected paths are redirected to login with returnUrl.
 * Authenticated users on auth pages are redirected to the home page.
 */

import { getRootPath } from '@dropins/tools/lib/aem/configs.js';
import {
  checkIsAuthenticated,
  rootLink,
  CUSTOMER_LOGIN_PATH,
  CUSTOMER_FORGOTPASSWORD_PATH,
} from './commerce.js';

/** Paths that require authentication. Use includes() for flexible matching. */
const PROTECTED_PATH_PATTERNS = [
  '/dashboard',
  '/order-list',
  '/order-new-delivery',
  '/order', // /order is the order wizard - protect it (avoid /order-status, /order-details)
  '/invoices',
  '/users',
  '/locations',
  '/equipment',
  '/reports',
  '/support',
  '/customer/orders',
  '/customer/order-details',
  '/customer/account',
  '/customer/address',
  '/customer/returns',
  '/customer/requisition-lists',
  '/customer/company',
  '/customer/approval-rules',
  '/customer/approval-rule',
  '/customer/purchase-orders',
  '/customer/purchase-order-details',
  '/customer/negotiable-quote',
  '/customer/negotiable-quote-template',
];

/** Paths that are auth-only (login, create account, forgot password). Authenticated users get redirected. */
const AUTH_ONLY_PATH_PATTERNS = [
  '/customer/login',
  '/customer/forgotpassword',
  '/customer/create-account',
  '/customer/create',
  '/customer/confirm-account',
  '/customer/create-password',
];

/** Public paths that must NOT be protected (guest order lookup, etc.) */
const PUBLIC_PATH_PATTERNS = [
  '/order-status',
  '/order-details',
  '/return-details',
  '/create-return',
  '/privacy-policy',
];

/**
 * Normalizes pathname for matching (strips root/locale prefix).
 * @param {string} pathname - window.location.pathname
 * @returns {string} Path relative to app root
 */
function getEffectivePath(pathname) {
  try {
    const root = getRootPath().replace(/\/$/, '');
    if (root && pathname.startsWith(root)) {
      const stripped = pathname.slice(root.length) || '/';
      return stripped;
    }
  } catch {
    // Config may not be initialized yet
  }
  return pathname || '/';
}

/**
 * Checks if the effective path matches any of the given patterns.
 * @param {string} effectivePath - Normalized path
 * @param {string[]} patterns - Path patterns (exact or prefix match)
 * @returns {boolean}
 */
function pathMatches(effectivePath, patterns) {
  const normalized = effectivePath.replace(/\/$/, '') || '/';
  return patterns.some((pattern) => {
    const p = pattern.replace(/\/$/, '') || '/';
    return normalized === p || normalized.startsWith(`${p}/`);
  });
}

/**
 * Special case: /order must be protected, but /order-status and /order-details are public.
 */
function isOrderPathProtected(effectivePath) {
  if (effectivePath === '/order' || effectivePath.startsWith('/order/')) return true;
  if (effectivePath === '/order-new-delivery' || effectivePath.startsWith('/order-new-delivery/')) return true;
  if (effectivePath === '/order-status' || effectivePath.startsWith('/order-status')) return false;
  if (effectivePath === '/order-details' || effectivePath.startsWith('/order-details')) return false;
  return false;
}

/**
 * Checks if the current path is a protected portal path.
 * @returns {boolean}
 */
export function isProtectedPath() {
  const pathname = window.location.pathname;
  const effectivePath = getEffectivePath(pathname);

  // Homepage / root is protected
  if (effectivePath === '/' || effectivePath === '') return true;

  // Order path special handling
  if (isOrderPathProtected(effectivePath)) return true;

  // Explicit public paths
  if (pathMatches(effectivePath, PUBLIC_PATH_PATTERNS)) return false;

  // Customer subpaths: protect all except auth-only
  if (effectivePath.startsWith('/customer/')) {
    if (pathMatches(effectivePath, AUTH_ONLY_PATH_PATTERNS)) return false;
    return true;
  }

  // Other protected patterns
  return pathMatches(effectivePath, PROTECTED_PATH_PATTERNS);
}

/**
 * Checks if the current path is an auth-only path (login, create account, forgot password).
 * @returns {boolean}
 */
export function isAuthOnlyPath() {
  const effectivePath = getEffectivePath(window.location.pathname);
  return pathMatches(effectivePath, AUTH_ONLY_PATH_PATTERNS);
}

/**
 * Gets the redirect URL after successful login (returnUrl or home page).
 * @returns {string}
 */
export function getPostLoginRedirectUrl() {
  const params = new URLSearchParams(window.location.search);
  const returnUrl = params.get('returnUrl');
  if (returnUrl && returnUrl.startsWith('/') && !returnUrl.includes('/customer/login')) {
    return rootLink(returnUrl);
  }
  return rootLink('/');
}

/**
 * Runs the auth gate. Redirects if necessary. Call this before decorateMain.
 * @returns {Promise<boolean>} - true if page load should continue, false if redirect occurred
 */
export async function runAuthGate() {
  const pathname = window.location.pathname;
  const authenticated = checkIsAuthenticated();

  // Authenticated user on auth-only page → redirect to dashboard or returnUrl
  if (authenticated && isAuthOnlyPath()) {
    const redirectTo = getPostLoginRedirectUrl();
    window.location.replace(redirectTo);
    return false;
  }

  // Unauthenticated user on protected path → redirect to login with returnUrl
  if (!authenticated && isProtectedPath()) {
    const loginUrl = rootLink(CUSTOMER_LOGIN_PATH);
    const effectivePath = getEffectivePath(pathname);
    const returnUrl = effectivePath && effectivePath !== '/' ? effectivePath : '/dashboard';
    const separator = loginUrl.includes('?') ? '&' : '?';
    const fullUrl = `${loginUrl}${separator}returnUrl=${encodeURIComponent(returnUrl)}`;
    window.location.replace(fullUrl);
    return false;
  }

  return true;
}
