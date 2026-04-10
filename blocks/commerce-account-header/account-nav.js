/**
 * My Account – Left Navigation Rail
 *
 * Builds the same left-nav structure as the dashboard but with only
 * My account items from the sidebar fragment.
 */

import { loadFragment } from '../fragment/fragment.js';
import { getCodeAssetUrl, rootLink, CUSTOMER_ORDERS_PATH } from '../../scripts/commerce.js';

/* ── SVG Icons (match dashboard style) ──────────────────────────────────── */

const ICONS = {
  User: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`,
  orders: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
    <rect x="9" y="3" width="6" height="4" rx="1"/>
    <path d="M9 12h6M9 16h4"/>
  </svg>`,
  MapPin: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>`,
  Package: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>`,
  FileText: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <path d="M14 2v6h6"/>
    <path d="M8 13h8"/>
    <path d="M8 17h5"/>
  </svg>`,
  Briefcase: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
  </svg>`,
  Layers: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="12 2 2 7 12 12 22 7 12 12"/>
    <polyline points="2 17 12 22 22 17"/>
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
};

/* Fallback for unknown icons */
const DEFAULT_ICON = ICONS.User;

/* Icon name mapping (fragment may use different names) */
const ICON_MAP = {
  user: 'User',
  orders: 'orders',
  order: 'orders',
  address: 'MapPin',
  addresses: 'MapPin',
  mappin: 'MapPin',
  return: 'Package',
  returns: 'Package',
  package: 'Package',
  requisition: 'FileText',
  requisitionlist: 'FileText',
  filetext: 'FileText',
  company: 'Briefcase',
  briefcase: 'Briefcase',
  structure: 'Layers',
  layers: 'Layers',
  companyusers: 'companyUsers',
  users: 'companyUsers',
  placeholder: 'User',
};

function getIconSvg(iconName) {
  if (!iconName) return DEFAULT_ICON;
  const key = String(iconName).trim().replace(/\s+/g, '').toLowerCase();
  const mapped = ICON_MAP[key] || iconName;
  return ICONS[mapped] || ICONS[iconName] || DEFAULT_ICON;
}

function isItemActive(href) {
  if (!href || href === '#') return false;
  if (href === CUSTOMER_ORDERS_PATH) {
    return window.location.href.includes(CUSTOMER_ORDERS_PATH);
  }
  return window.location.href.includes(href);
}

function buildNavItem(item) {
  const { title, subtitle, href, icon } = item;
  const active = isItemActive(href);
  const li = document.createElement('li');
  li.className = `chep-nav__item${active ? ' chep-nav__item--active' : ''}`;

  const a = document.createElement('a');
  a.href = rootLink(href || '#');
  a.className = 'chep-nav__link';
  a.setAttribute('aria-current', active ? 'page' : 'false');
  a.innerHTML = `
    <span class="chep-nav__icon">${getIconSvg(icon)}</span>
    <span class="chep-nav__label">${title || 'Item'}</span>
    ${active ? `<span class="chep-nav__active-indicator">${ICONS.chevronRight}</span>` : ''}
  `;

  li.appendChild(a);
  return li;
}

/**
 * Parse sidebar fragment into nav items.
 * @param {DocumentFragment|Element} fragment
 * @returns {Array<{title: string, subtitle: string, href: string, icon: string}>}
 */
function parseSidebarFragment(fragment) {
  const items = [];
  const listItems = fragment.querySelectorAll('.default-content-wrapper > ol > li');

  listItems.forEach((li) => {
    const itemParams = Array.from(li.querySelectorAll('ol > li'));
    const title = li.childNodes[0]?.textContent?.trim()
      || li.querySelector(':scope > p')?.textContent?.trim()
      || 'Item';
    const subtitle = itemParams[0]?.innerText?.trim() || '';
    const linkRaw = itemParams[1]?.innerText?.trim() || '#';
    const href = linkRaw === '#' ? '#' : (linkRaw.startsWith('/') ? linkRaw : `/${linkRaw}`);
    const icon = itemParams[2]?.innerText?.trim() || 'User';

    items.push({ title, subtitle, href, icon });
  });

  return items;
}

/**
 * Build the left-hand navigation for My Account pages.
 * Uses the same layout as dashboard but with only account items from the fragment.
 * @param {string} [_pathname] - Unused, kept for API consistency
 * @param {Array} navItems - Optional pre-parsed items; if not provided, loads from fragment
 * @returns {Promise<HTMLElement>} The nav element
 */
export async function buildAccountNav(pathname, navItems = null) {
  let items = navItems;

  if (!items || items.length === 0) {
    const fragment = await loadFragment('/customer/sidebar-fragment');
    items = parseSidebarFragment(fragment);
  }

  const nav = document.createElement('nav');
  nav.className = 'chep-nav';
  nav.setAttribute('aria-label', 'My account navigation');

  const logoArea = document.createElement('div');
  logoArea.className = 'chep-nav__logo';
  logoArea.innerHTML = `
    <a href="${rootLink('/')}" class="chep-nav__logo-link" aria-label="Bodea Home">
      <img src="${getCodeAssetUrl('/images/bodea-inc-logo-white.png')}" alt="Bodea - Smart. Simple. Fast." class="chep-nav__logo-img" width="140" height="auto" />
    </a>
  `;
  nav.appendChild(logoArea);

  const ul = document.createElement('ul');
  ul.className = 'chep-nav__list';
  ul.setAttribute('role', 'list');

  items.forEach((item) => {
    ul.appendChild(buildNavItem(item));
  });

  nav.appendChild(ul);

  const footer = document.createElement('div');
  footer.className = 'chep-nav__footer';
  footer.innerHTML = `
    <div class="chep-nav__footer-brand">
      <span class="chep-nav__footer-text">Bodea</span>
    </div>
  `;
  nav.appendChild(footer);

  const overlay = document.createElement('div');
  overlay.className = 'chep-nav__overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.addEventListener('click', () => closeAccountNav(nav, overlay));
  document.body.appendChild(overlay);
  nav.__overlay = overlay;

  return nav;
}

export function openAccountNav(nav) {
  nav.classList.add('chep-nav--open');
  if (nav.__overlay) {
    nav.__overlay.classList.add('chep-nav__overlay--visible');
  }
  document.body.style.overflow = 'hidden';
}

export function closeAccountNav(nav, overlay) {
  nav.classList.remove('chep-nav--open');
  if (overlay) {
    overlay.classList.remove('chep-nav__overlay--visible');
  }
  document.body.style.overflow = '';
}

export function toggleAccountNav(nav) {
  if (nav.classList.contains('chep-nav--open')) {
    closeAccountNav(nav, nav.__overlay);
  } else {
    openAccountNav(nav);
  }
}
