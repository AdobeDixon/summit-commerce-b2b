/**
 * CHEP Dashboard – Left Navigation Rail
 *
 * Builds and returns the left-hand nav DOM element.
 * Active state is derived from the current window.location.pathname.
 */

import { NAV_ITEMS } from './dashboard-config.js';

/* ── SVG Icons ─────────────────────────────────────────────────────────── */

const ICONS = {
  dashboard: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>`,

  orders: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
    <rect x="9" y="3" width="6" height="4" rx="1"/>
    <path d="M9 12h6M9 16h4"/>
  </svg>`,

  invoices: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <path d="M14 2v6h6"/>
    <path d="M8 13h8"/>
    <path d="M8 17h5"/>
  </svg>`,

  equipment: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>`,

  locations: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>`,

  reports: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
    <path d="M3 20h18"/>
  </svg>`,

  support: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>`,

  companyUsers: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>`,

  chevronRight: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="9 18 15 12 9 6"/>
  </svg>`,

  menu: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>`,

  close: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
};

/* ── myCHEP Logo Image ─────────────────────────────────────────────────── */

const MYCHEP_LOGO_IMG = `<img src="/images/mychep-logo.png" alt="myCHEP - Smart. Simple. Fast." class="chep-nav__logo-img" width="140" height="auto" />`;

/* ── Helpers ───────────────────────────────────────────────────────────── */

function isActive(item, pathname) {
  if (item.matchPaths) {
    return item.matchPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function buildNavItem(item, pathname) {
  const active = isActive(item, pathname);
  const li = document.createElement('li');
  li.className = `chep-nav__item${active ? ' chep-nav__item--active' : ''}`;

  const a = document.createElement('a');
  a.href = item.href;
  a.className = 'chep-nav__link';
  a.setAttribute('aria-current', active ? 'page' : 'false');
  a.innerHTML = `
    <span class="chep-nav__icon">${ICONS[item.icon] ?? ''}</span>
    <span class="chep-nav__label">${item.label}</span>
    ${active ? `<span class="chep-nav__active-indicator">${ICONS.chevronRight}</span>` : ''}
  `;

  li.appendChild(a);
  return li;
}

/* ── Builder ───────────────────────────────────────────────────────────── */

/**
 * Build the left-hand navigation sidebar.
 * @param {string} pathname - Current page pathname (window.location.pathname)
 * @returns {HTMLElement} The nav element
 */
export function buildNav(pathname) {
  const nav = document.createElement('nav');
  nav.className = 'chep-nav';
  nav.setAttribute('aria-label', 'Dashboard navigation');

  /* Logo */
  const logoArea = document.createElement('div');
  logoArea.className = 'chep-nav__logo';
  logoArea.innerHTML = `
    <a href="/" class="chep-nav__logo-link" aria-label="myCHEP Home">
      ${MYCHEP_LOGO_IMG}
    </a>
  `;
  nav.appendChild(logoArea);

  /* Nav items */
  const ul = document.createElement('ul');
  ul.className = 'chep-nav__list';
  ul.setAttribute('role', 'list');

  NAV_ITEMS.forEach((item) => {
    ul.appendChild(buildNavItem(item, pathname));
  });

  nav.appendChild(ul);

  /* Footer */
  const footer = document.createElement('div');
  footer.className = 'chep-nav__footer';
  footer.innerHTML = `
    <div class="chep-nav__footer-brand">
      <span class="chep-nav__footer-text">Powered by CHEP</span>
      <span class="chep-nav__footer-sub">Brambles Group Limited</span>
    </div>
  `;
  nav.appendChild(footer);

  /* Mobile overlay toggle */
  const overlay = document.createElement('div');
  overlay.className = 'chep-nav__overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.addEventListener('click', () => closeNav(nav, overlay));
  document.body.appendChild(overlay);

  /* Mobile open/close toggle from topbar is handled via exported toggleNav */
  nav.__overlay = overlay;

  return nav;
}

export function openNav(nav) {
  nav.classList.add('chep-nav--open');
  if (nav.__overlay) {
    nav.__overlay.classList.add('chep-nav__overlay--visible');
  }
  document.body.style.overflow = 'hidden';
}

export function closeNav(nav) {
  nav.classList.remove('chep-nav--open');
  if (nav.__overlay) {
    nav.__overlay.classList.remove('chep-nav__overlay--visible');
  }
  document.body.style.overflow = '';
}

export function toggleNav(nav) {
  if (nav.classList.contains('chep-nav--open')) {
    closeNav(nav);
  } else {
    openNav(nav);
  }
}

export { ICONS };
