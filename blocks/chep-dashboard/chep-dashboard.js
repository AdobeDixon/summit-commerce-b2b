/**
 * CHEP Dashboard Block
 *
 * Main orchestrator for the MyCHEP homepage dashboard experience.
 * Builds the full page shell (left nav + main content), then loads
 * real Commerce data asynchronously to populate each section.
 *
 * ── ADDING THIS PAGE ───────────────────────────────────────────────────
 * To place this dashboard on a page:
 * 1. Create a document in Adobe Document Authoring at /dashboard (or /)
 * 2. Add a "CHEP Dashboard" block to the document (single empty cell)
 * 3. The block takes over the full viewport — it hides the standard
 *    header and footer via the `dashboard-page` body class
 * 4. Publish the document
 *
 * ── ARCHITECTURE ───────────────────────────────────────────────────────
 * - dashboard-config.js   — all configuration (SKUs, thresholds, nav, etc.)
 * - dashboard-service.js  — GraphQL data layer (orders + product stock)
 * - dashboard-nav.js      — left nav rail builder
 * - dashboard-kpi.js      — KPI summary cards
 * - dashboard-orders.js   — recent orders table
 * - dashboard-stock.js    — low stock alert panel
 * - dashboard-equipment.js — equipment overview cards
 * - dashboard-map.js      — Leaflet map + deliveries panel + quick actions
 *
 * ── DATA STATUS ────────────────────────────────────────────────────────
 * Real Commerce data: orders list, product names, stock_status
 * Derived from real data: KPI counts, delivering-today proxy
 * Requires inventory API: exact stock quantities (see dashboard-service.js)
 */

import {
  checkIsAuthenticated, rootLink, CUSTOMER_ACCOUNT_PATH, CUSTOMER_ORDERS_PATH, CUSTOMER_LOGIN_PATH,
} from '../../scripts/commerce.js';
import { buildNav, toggleNav } from './dashboard-nav.js';
import { buildKpiSection, updateKpiSection } from './dashboard-kpi.js';
import { buildOrdersSection, updateOrdersSection } from './dashboard-orders.js';
import { buildStockSection, updateStockSection } from './dashboard-stock.js';
import { buildEquipmentSection, updateEquipmentSection } from './dashboard-equipment.js';
import {
  buildBottomSection,
  initializeBottomSectionMap,
  updateDeliveriesPanel,
} from './dashboard-map.js';
import { DashboardService } from './dashboard-service.js';

/* ── Placeholder notifications ─────────────────────────────────────────── */
// PLACEHOLDER: Sample dispatch/operations notifications for demo purposes.
// TODO: Replace with a real notification feed (Commerce events, webhook, or CRM).
const PLACEHOLDER_NOTIFICATIONS = [
  {
    id: 'n1',
    type: 'dispatch',
    title: 'Order dispatched',
    body: 'Order #1002854 has been dispatched to Manchester DC.',
    time: '2h ago',
    unread: true,
  },
  {
    id: 'n2',
    type: 'stock',
    title: 'Low stock alert',
    body: 'CHEP Standard Pallet is below 250 units threshold.',
    time: '4h ago',
    unread: true,
  },
  {
    id: 'n3',
    type: 'delivery',
    title: 'Delivery confirmed',
    body: 'Order #1002786 delivered to Birmingham Service Hub.',
    time: '1d ago',
    unread: false,
  },
];

/* ── New customer welcome banner (no orders yet) ─────────────────────────── */

function buildNewCustomerBanner() {
  const banner = document.createElement('div');
  banner.className = 'dashboard-new-customer-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Welcome to MyCHEP');
  banner.style.cssText = 'display:block !important; min-height:1px;'; /* fallback visibility */

  banner.innerHTML = `
    <div class="dashboard-new-customer-banner__inner">
      <div class="dashboard-new-customer-banner__content">
        <h2 class="dashboard-new-customer-banner__heading">Welcome to MyCHEP</h2>
        <p class="dashboard-new-customer-banner__text">
          You're all set up. Get started by creating your first order — use the button in the top right to place an order.
        </p>
        <div class="dashboard-new-customer-banner__guides">
          <span class="dashboard-new-customer-banner__guides-label">User guides</span>
          <div class="dashboard-new-customer-banner__guide-btns">
            <button type="button" class="dashboard-new-customer-banner__guide-btn" disabled>Getting Started</button>
            <button type="button" class="dashboard-new-customer-banner__guide-btn" disabled>Ordering Guide</button>
            <button type="button" class="dashboard-new-customer-banner__guide-btn" disabled>Equipment Overview</button>
          </div>
        </div>
      </div>
      <div class="dashboard-new-customer-banner__accent" aria-hidden="true"></div>
    </div>
  `;

  return banner;
}

/* ── Welcome banner ────────────────────────────────────────────────────── */

function buildWelcomeBanner(customerName) {
  const banner = document.createElement('div');
  banner.className = 'dashboard-welcome';

  banner.innerHTML = `
    <div class="dashboard-welcome__text">
      <h1 class="dashboard-welcome__heading">
        ${customerName ? `Welcome back, ${customerName}!` : 'Welcome to MyCHEP'}
      </h1>
      <p class="dashboard-welcome__sub">Your logistics control centre</p>
    </div>
    <a href="${rootLink('/order')}" class="dashboard-welcome__cta">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      Create New Order
    </a>
  `;

  return banner;
}

/* ── Notification panel ────────────────────────────────────────────────── */

const NOTIF_TYPE_ICONS = {
  dispatch: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  stock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  delivery: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
};

function buildNotifPanel() {
  const unreadCount = PLACEHOLDER_NOTIFICATIONS.filter((n) => n.unread).length;

  const panel = document.createElement('div');
  panel.className = 'topbar-notif-panel';
  panel.setAttribute('aria-label', 'Notifications');
  panel.setAttribute('role', 'dialog');
  panel.hidden = true;

  panel.innerHTML = `
    <div class="topbar-notif-panel__header">
      <span class="topbar-notif-panel__title">Notifications</span>
      ${unreadCount > 0 ? `<span class="topbar-notif-panel__count">${unreadCount} new</span>` : ''}
    </div>
    <ul class="topbar-notif-panel__list" role="list">
      ${PLACEHOLDER_NOTIFICATIONS.map((n) => `
        <li class="topbar-notif-item${n.unread ? ' topbar-notif-item--unread' : ''}">
          <span class="topbar-notif-item__icon topbar-notif-item__icon--${n.type}">
            ${NOTIF_TYPE_ICONS[n.type] ?? ''}
          </span>
          <div class="topbar-notif-item__body">
            <span class="topbar-notif-item__title">${n.title}</span>
            <span class="topbar-notif-item__text">${n.body}</span>
            <span class="topbar-notif-item__time">${n.time}</span>
          </div>
          ${n.unread ? '<span class="topbar-notif-item__dot" aria-hidden="true"></span>' : ''}
        </li>
      `).join('')}
    </ul>
    <div class="topbar-notif-panel__footer">
      <span class="topbar-notif-panel__note">Sample notifications — live feed coming soon</span>
    </div>
  `;

  return panel;
}

/* ── Account dropdown panel ────────────────────────────────────────────── */

function buildAccountDropdown(isAuthenticated) {
  const dropdown = document.createElement('div');
  dropdown.className = 'topbar-account-dropdown';
  dropdown.setAttribute('role', 'menu');
  dropdown.hidden = true;

  if (isAuthenticated) {
    dropdown.innerHTML = `
      <a href="${rootLink(CUSTOMER_ACCOUNT_PATH)}" class="topbar-account-dropdown__item" role="menuitem">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        View Account
      </a>
      <a href="${rootLink(CUSTOMER_ORDERS_PATH)}" class="topbar-account-dropdown__item" role="menuitem">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
        My Orders
      </a>
      <a href="${rootLink('/order')}" class="topbar-account-dropdown__item" role="menuitem">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New Order
      </a>
      <hr class="topbar-account-dropdown__divider"/>
      <button class="topbar-account-dropdown__item topbar-account-dropdown__item--signout" type="button" role="menuitem">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Sign Out
      </button>
    `;

    /* Sign out */
    dropdown.querySelector('.topbar-account-dropdown__item--signout')
      .addEventListener('click', async () => {
        try {
          const { revokeCustomerToken } = await import('@dropins/storefront-auth/api.js');
          await revokeCustomerToken();
          window.location.href = rootLink(CUSTOMER_LOGIN_PATH);
        } catch {
          window.location.href = rootLink(CUSTOMER_LOGIN_PATH);
        }
      });
  } else {
    dropdown.innerHTML = `
      <a href="${rootLink(CUSTOMER_LOGIN_PATH)}" class="topbar-account-dropdown__item topbar-account-dropdown__item--primary" role="menuitem">
        Sign In
      </a>
    `;
  }

  return dropdown;
}

/* ── Top bar ───────────────────────────────────────────────────────────── */

function buildTopBar(navElement) {
  const isAuthenticated = checkIsAuthenticated();
  const unreadCount = PLACEHOLDER_NOTIFICATIONS.filter((n) => n.unread).length;

  const topBar = document.createElement('div');
  topBar.className = 'chep-topbar';
  topBar.setAttribute('role', 'banner');

  topBar.innerHTML = `
    <button class="chep-topbar__menu-btn" aria-label="Toggle navigation" type="button">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>

    <div class="chep-topbar__search-wrap">
      <label class="chep-topbar__search-label" for="dashboard-search">Search orders</label>
      <div class="chep-topbar__search-inner">
        <svg class="chep-topbar__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          id="dashboard-search"
          type="search"
          class="chep-topbar__search-input"
          placeholder="Search orders…"
          autocomplete="off"
          aria-label="Search orders"
        />
      </div>
    </div>

    <div class="chep-topbar__actions">
      <!-- Notifications button + panel -->
      <div class="chep-topbar__notif-wrap">
        <button class="chep-topbar__icon-btn chep-topbar__notif-btn" type="button" aria-label="${unreadCount} notifications" aria-haspopup="true" aria-expanded="false">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          ${unreadCount > 0 ? `<span class="chep-topbar__notif-badge" aria-hidden="true">${unreadCount}</span>` : ''}
        </button>
      </div>

      <!-- Account button + dropdown -->
      <div class="chep-topbar__account-wrap">
        <button class="chep-topbar__account" type="button" aria-haspopup="true" aria-expanded="false">
          <div class="chep-topbar__avatar" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div class="chep-topbar__account-text">
            <span class="chep-topbar__account-name chep-topbar__account-name--loading">Loading…</span>
            <span class="chep-topbar__account-role">CHEP Customer</span>
          </div>
          <svg class="chep-topbar__account-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  /* Wire mobile menu toggle */
  topBar.querySelector('.chep-topbar__menu-btn').addEventListener('click', () => toggleNav(navElement));

  /* Search */
  const searchInput = topBar.querySelector('.chep-topbar__search-input');
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && searchInput.value.trim()) {
      window.location.href = rootLink(`/order-list?q=${encodeURIComponent(searchInput.value.trim())}`);
    }
  });

  /* Notification panel */
  const notifWrap = topBar.querySelector('.chep-topbar__notif-wrap');
  const notifBtn = topBar.querySelector('.chep-topbar__notif-btn');
  const notifPanel = buildNotifPanel();
  notifWrap.appendChild(notifPanel);

  notifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !notifPanel.hidden;
    notifPanel.hidden = open;
    notifBtn.setAttribute('aria-expanded', String(!open));
    if (!open) {
      topBar.querySelector('.topbar-account-dropdown').hidden = true;
      topBar.querySelector('.chep-topbar__account').setAttribute('aria-expanded', 'false');
    }
  });

  /* Account dropdown */
  const accountWrap = topBar.querySelector('.chep-topbar__account-wrap');
  const accountBtn = topBar.querySelector('.chep-topbar__account');
  const accountDropdown = buildAccountDropdown(isAuthenticated);
  accountWrap.appendChild(accountDropdown);

  accountBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !accountDropdown.hidden;
    accountDropdown.hidden = open;
    accountBtn.setAttribute('aria-expanded', String(!open));
    if (!open) {
      notifPanel.hidden = true;
      notifBtn.setAttribute('aria-expanded', 'false');
    }
  });

  /* Close both panels on outside click */
  document.addEventListener('click', () => {
    notifPanel.hidden = true;
    accountDropdown.hidden = true;
    notifBtn.setAttribute('aria-expanded', 'false');
    accountBtn.setAttribute('aria-expanded', 'false');
  });

  return topBar;
}

/* ── Account name update ───────────────────────────────────────────────── */

function updateAccountName(topBar, customerIdentity) {
  const nameEl = topBar.querySelector('.chep-topbar__account-name');
  if (!nameEl) return;

  nameEl.classList.remove('chep-topbar__account-name--loading');

  if (customerIdentity?.firstname) {
    const name = [customerIdentity.firstname, customerIdentity.lastname].filter(Boolean).join(' ');
    nameEl.textContent = name;
  } else if (checkIsAuthenticated()) {
    nameEl.textContent = 'My Account';
  } else {
    nameEl.textContent = 'Guest';
  }
}

/* ── Main decorate ─────────────────────────────────────────────────────── */

export default async function decorate(block) {
  /* Take over the page layout */
  document.body.classList.add('dashboard-page');

  block.innerHTML = '';
  block.classList.add('chep-dashboard');

  const isAuthenticated = checkIsAuthenticated();
  const { pathname } = window.location;

  /* ── Build layout skeleton ─────────────────────────────────────────── */

  const nav = buildNav(pathname);
  block.appendChild(nav);

  const mainEl = document.createElement('div');
  mainEl.className = 'chep-dashboard-main';

  const topBar = buildTopBar(nav);
  mainEl.appendChild(topBar);

  const content = document.createElement('div');
  content.className = 'chep-dashboard-content';

  /* Welcome banner (placeholder name until data loads) */
  const welcomeBanner = buildWelcomeBanner(null);
  content.appendChild(welcomeBanner);

  /* KPI section */
  const kpiSection = buildKpiSection();
  content.appendChild(kpiSection);

  /* Main grid: orders + stock */
  const mainGrid = document.createElement('div');
  mainGrid.className = 'dashboard-main-grid';

  const ordersSection = buildOrdersSection();
  const stockSection = buildStockSection();
  mainGrid.appendChild(ordersSection);
  mainGrid.appendChild(stockSection);
  content.appendChild(mainGrid);

  /* Equipment overview */
  const equipmentSection = buildEquipmentSection();
  content.appendChild(equipmentSection);

  /* Bottom section: map + deliveries + quick actions */
  const bottomSection = buildBottomSection();
  content.appendChild(bottomSection);

  mainEl.appendChild(content);
  block.appendChild(mainEl);

  /* Initialise the map only after the section is attached to the document. */
  requestAnimationFrame(() => initializeBottomSectionMap(bottomSection));

  /* ── Load data asynchronously ──────────────────────────────────────── */

  try {
    const { customerIdentity, ordersData, stockData } = await DashboardService.loadAll();

    /* Update topbar account name — uses dedicated identity query, independent of orders */
    updateAccountName(topBar, customerIdentity);

    /* Show new customer banner when authenticated and no orders */
    const totalCount = ordersData?.totalCount ?? 0;
    const hasNoOrders = totalCount === 0;
    const isLoggedIn = customerIdentity != null || ordersData != null;
    const customerEmail = (customerIdentity?.email ?? ordersData?.customer?.email ?? '').toLowerCase();
    const forceShowBanner = new URLSearchParams(window.location.search).get('newCustomerPreview') === '1';
    const isBannerEmail = customerEmail === 'tl@ig.com';
    const showNewCustomerBanner = forceShowBanner || isBannerEmail || (isLoggedIn && hasNoOrders);

    if (showNewCustomerBanner) {
      const newCustomerBanner = buildNewCustomerBanner();
      content.prepend(newCustomerBanner);
    }

    /* Update welcome banner with real customer first name */
    const firstname = customerIdentity?.firstname ?? ordersData?.customer?.firstname;
    if (firstname) {
      const heading = welcomeBanner.querySelector('.dashboard-welcome__heading');
      if (heading) heading.textContent = `Welcome back, ${firstname}!`;
    }

    /* Update KPI cards */
    updateKpiSection(kpiSection, { ordersData, stockData, isAuthenticated });

    /* Update orders table */
    updateOrdersSection(ordersSection, ordersData, isAuthenticated);

    /* Update stock alerts */
    updateStockSection(stockSection, stockData);

    /* Update equipment cards */
    updateEquipmentSection(equipmentSection, stockData);

    /* Update deliveries panel */
    updateDeliveriesPanel(bottomSection, ordersData, isAuthenticated);
  } catch (err) {
    console.error('[CHEP Dashboard] Data load failed:', err);

    updateKpiSection(kpiSection, { ordersData: null, stockData: [], isAuthenticated });
    updateOrdersSection(ordersSection, null, isAuthenticated);
    updateStockSection(stockSection, []);
    updateEquipmentSection(equipmentSection, []);
    updateDeliveriesPanel(bottomSection, null, isAuthenticated);
    updateAccountName(topBar, null);
  }
}
