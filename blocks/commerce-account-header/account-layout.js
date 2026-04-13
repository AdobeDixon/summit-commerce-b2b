/**
 * Shared account layout logic – apply dashboard-style layout on customer pages.
 * Used by commerce-account-header and commerce-account-sidebar (fallback).
 */

import { getRootPath } from '@dropins/tools/lib/aem/configs.js';
import { loadCSS } from '../../scripts/aem.js';
import {
  buildAccountNav,
  toggleAccountNav,
} from './account-nav.js';
import {
  CUSTOMER_ACCOUNT_PATH,
  CUSTOMER_LOGIN_PATH,
  CUSTOMER_FORGOTPASSWORD_PATH,
  rootLink,
} from '../../scripts/commerce.js';

function getEffectivePath() {
  const { pathname } = window.location;
  try {
    const root = getRootPath().replace(/\/$/, '');
    if (root && pathname.startsWith(root)) {
      return pathname.slice(root.length) || '/';
    }
  } catch {
    // Config may not be initialized yet
  }
  return pathname || '/';
}

/**
 * Auth-only /customer/* flows (login, signup, password) — keep global header, not portal shell.
 * Mirrors scripts/auth-gate.js AUTH_ONLY_PATH_PATTERNS.
 */
function isAuthOnlyCustomerPath() {
  const p = getEffectivePath().replace(/\/$/, '') || '/';
  const isUnder = (pattern) => p === pattern || p.startsWith(`${pattern}/`);
  return (
    isUnder('/customer/login')
    || isUnder('/customer/forgotpassword')
    || isUnder('/customer/create-account')
    || isUnder('/customer/create')
    || isUnder('/customer/confirm-account')
    || isUnder('/customer/create-password')
  );
}

/**
 * True for /customer/* pages that should use the Bodea portal shell (left nav + top bar).
 * Excludes login/signup and works with locale-prefixed paths.
 */
export function isCustomerPortalPath() {
  const p = getEffectivePath();
  if (!p.includes('/customer/')) return false;
  return !isAuthOnlyCustomerPath();
}

export function isAccountPage() {
  const { pathname } = window.location;
  if (document.body.classList.contains('columns')) return true;
  if (!pathname.includes('/customer/')) return false;
  if (pathname.includes(CUSTOMER_LOGIN_PATH) || pathname.includes(CUSTOMER_FORGOTPASSWORD_PATH)) {
    return false;
  }
  return true;
}

export function isAccountLayoutApplied() {
  const main = document.querySelector('main');
  return main?.querySelector(':scope > .bodea-nav') != null;
}

function buildAccountTopBar(navElement, pageTitle = 'My Account') {
  const topBar = document.createElement('div');
  topBar.className = 'commerce-account-shell__topbar';
  topBar.innerHTML = `
    <button class="commerce-account-shell__menu-btn" aria-label="Toggle navigation" type="button">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
    <div class="commerce-account-shell__topbar-copy">
      <span class="commerce-account-shell__eyebrow">Customer Portal</span>
      <h1 class="commerce-account-shell__page-title">${pageTitle}</h1>
    </div>
    <a class="commerce-account-shell__account-link" href="${rootLink(CUSTOMER_ACCOUNT_PATH)}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      <span class="commerce-account-shell__account-name">My Account</span>
    </a>
  `;
  topBar.querySelector('.commerce-account-shell__menu-btn')
    .addEventListener('click', () => toggleAccountNav(navElement));
  return topBar;
}

function getPageTitleFromPath() {
  const { pathname } = window.location;
  if (pathname.includes('/order-details')) return 'Order details';
  if (pathname.includes('/orders') || pathname.includes('/order-list')) return 'Your orders';
  if (pathname.includes('/address')) return 'Addresses';
  if (pathname.includes('/returns')) return 'Returns';
  if (pathname.includes('/requisition-lists')) return 'Requisition Lists';
  if (pathname.includes('/company/users') || pathname.includes('/users')) return 'Company Users';
  if (pathname.includes('/company')) return 'Company';
  return 'My Account';
}

export async function applyAccountLayout(pageTitle = null) {
  const main = document.querySelector('main');
  if (!main || isAccountLayoutApplied()) return;

  document.body.classList.add('dashboard-page', 'account-page');

  const nav = await buildAccountNav(null, null);

  const mainArea = document.createElement('div');
  mainArea.className = 'commerce-account-shell__main';

  const title = pageTitle || getPageTitleFromPath();
  const topBar = buildAccountTopBar(nav, title);
  mainArea.appendChild(topBar);

  const content = document.createElement('div');
  content.className = 'commerce-account-shell__content';

  const sections = [...main.children];
  sections.forEach((section) => content.appendChild(section));

  main.innerHTML = '';
  main.appendChild(nav);
  main.appendChild(mainArea);
  mainArea.appendChild(content);
}

let accountPageShellPromise = null;

/**
 * Updates the portal shell title when a page also uses commerce-account-header with a custom title.
 */
export function setAccountShellPageTitle(pageTitle) {
  if (!pageTitle) return;
  const el = document.querySelector('.commerce-account-shell__page-title');
  if (el) el.textContent = pageTitle;
}

/**
 * Applies the Bodea account shell for any /customer/* portal route when blocks like
 * commerce-account-sidebar live in lazy sections (too late), or when those blocks are omitted.
 * Safe to call from multiple blocks; coalesced with accountPageShellPromise.
 *
 * @param {string|null} [pageTitle] - Optional title; when layout exists, updates the top bar.
 */
export async function ensureAccountPageShell(pageTitle = null) {
  if (isAccountLayoutApplied()) {
    setAccountShellPageTitle(pageTitle);
    return;
  }
  if (!isCustomerPortalPath()) return;

  if (!accountPageShellPromise) {
    accountPageShellPromise = (async () => {
      await loadCSS(`${window.hlx.codeBasePath}/blocks/commerce-account-header/commerce-account-header.css`);
      await applyAccountLayout(pageTitle);
    })().finally(() => {
      accountPageShellPromise = null;
    });
  } else if (pageTitle) {
    setAccountShellPageTitle(pageTitle);
  }
  await accountPageShellPromise;
  if (pageTitle) setAccountShellPageTitle(pageTitle);
}
