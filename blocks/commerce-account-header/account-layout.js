/**
 * Shared account layout logic – apply dashboard-style layout on customer pages.
 * Used by commerce-account-header and commerce-account-sidebar (fallback).
 */

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
  return main?.querySelector(':scope > .chep-nav') != null;
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
