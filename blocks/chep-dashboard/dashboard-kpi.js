/**
 * CHEP Dashboard – KPI Summary Cards
 *
 * Renders a row of KPI metric cards. Each card displays a label, a large
 * numeric value, and a supporting subtitle.
 *
 * DATA NOTES (see dashboard-service.js → deriveKpis for full derivation logic):
 * - Active Orders:     real orders count from customer.orders (Commerce)
 * - Delivering Today:  derived — processing orders created today (proxy)
 * - Pickup Orders:     derived — pending orders (proxy; TODO: fulfilment integration)
 * - Low Stock Alerts:  real — products below LOW_STOCK_THRESHOLD or OUT_OF_STOCK
 * - Equipment Types:   config — count of FEATURED_EQUIPMENT_SKUS
 */

import { deriveKpis } from './dashboard-service.js';
import { LOW_STOCK_THRESHOLD } from './dashboard-config.js';

/* ── Icon SVGs ─────────────────────────────────────────────────────────── */

const KPI_ICONS = {
  orders: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
    <rect x="9" y="3" width="6" height="4" rx="1"/>
    <path d="M9 12h6M9 16h4"/>
  </svg>`,

  truck: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="1" y="3" width="15" height="13" rx="1"/>
    <path d="M16 8h4l3 5v3h-7V8z"/>
    <circle cx="5.5" cy="18.5" r="2.5"/>
    <circle cx="18.5" cy="18.5" r="2.5"/>
  </svg>`,

  pickup: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="7.5 4.21 12 6.81 16.5 4.21"/>
    <polyline points="7.5 19.79 7.5 14.6 3 12"/>
    <polyline points="21 12 16.5 14.6 16.5 19.79"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>`,

  alert: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>`,

  equipment: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    <line x1="12" y1="12" x2="12" y2="16"/>
    <line x1="10" y1="14" x2="14" y2="14"/>
  </svg>`,
};

/* ── KPI Card Definitions ──────────────────────────────────────────────── */

function getKpiDefinitions(kpis, isAuthenticated) {
  return [
    {
      id: 'active-orders',
      icon: 'orders',
      iconColor: 'blue',
      label: 'Active Orders',
      value: isAuthenticated ? kpis.activeOrders : '—',
      subtitle: 'orders',
      href: '/order-list',
    },
    {
      id: 'delivering-today',
      icon: 'truck',
      iconColor: 'teal',
      label: 'Delivering Today',
      value: isAuthenticated ? kpis.deliveringToday : '—',
      subtitle: 'deliveries',
      note: 'proxy: processing orders today',
      href: '/order-list',
    },
    {
      id: 'pickup-orders',
      icon: 'pickup',
      iconColor: 'blue',
      label: 'Pickup Orders',
      value: isAuthenticated ? kpis.pickupOrders : '—',
      subtitle: 'pending equipment',
      note: 'proxy: pending status orders',
      href: '/order-list',
    },
    {
      id: 'low-stock',
      icon: 'alert',
      iconColor: kpis.lowStockAlerts > 0 ? 'orange' : 'green',
      label: 'Low Stock Alerts',
      value: kpis.lowStockAlerts,
      subtitle: `items below ${LOW_STOCK_THRESHOLD} units`,
      href: '#low-stock',
    },
    {
      id: 'equipment-types',
      icon: 'equipment',
      iconColor: 'blue',
      label: 'Equipment Types',
      value: kpis.equipmentTypes,
      subtitle: 'pallet formats',
      href: '/order',
    },
  ];
}

/* ── Skeleton ──────────────────────────────────────────────────────────── */

function buildSkeletonCard() {
  const card = document.createElement('div');
  card.className = 'kpi-card kpi-card--skeleton';
  card.innerHTML = `
    <div class="kpi-card__icon-wrap kpi-card__skeleton-block" style="width:44px;height:44px;border-radius:10px"></div>
    <div class="kpi-card__body">
      <div class="kpi-card__skeleton-block" style="width:60px;height:32px;border-radius:4px;margin-bottom:6px"></div>
      <div class="kpi-card__skeleton-block" style="width:90px;height:14px;border-radius:3px;margin-bottom:4px"></div>
      <div class="kpi-card__skeleton-block" style="width:70px;height:12px;border-radius:3px"></div>
    </div>
  `;
  return card;
}

/* ── Full Card ─────────────────────────────────────────────────────────── */

function buildKpiCard(def) {
  const card = document.createElement('a');
  card.className = `kpi-card kpi-card--${def.iconColor}`;
  card.href = def.href ?? '#';
  card.setAttribute('aria-label', `${def.label}: ${def.value}`);

  card.innerHTML = `
    <div class="kpi-card__icon-wrap kpi-card__icon-wrap--${def.iconColor}">
      ${KPI_ICONS[def.icon] ?? ''}
    </div>
    <div class="kpi-card__body">
      <div class="kpi-card__value">${def.value ?? 0}</div>
      <div class="kpi-card__label">${def.label}</div>
      <div class="kpi-card__subtitle">${def.subtitle ?? ''}</div>
    </div>
  `;

  return card;
}

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Build the KPI section container with skeleton loading cards.
 * @returns {HTMLElement}
 */
export function buildKpiSection() {
  const section = document.createElement('section');
  section.className = 'dashboard-kpi';
  section.setAttribute('aria-label', 'Key performance indicators');

  for (let i = 0; i < 5; i += 1) {
    section.appendChild(buildSkeletonCard());
  }

  return section;
}

/**
 * Replace skeleton cards with real KPI data.
 * @param {HTMLElement} section
 * @param {{ ordersData: object|null, stockData: object[]|null, isAuthenticated: boolean }} payload
 */
export function updateKpiSection(section, { ordersData, stockData, isAuthenticated }) {
  const kpis = deriveKpis(ordersData, stockData ?? [], LOW_STOCK_THRESHOLD);
  const defs = getKpiDefinitions(kpis, isAuthenticated);

  section.innerHTML = '';
  defs.forEach((def) => {
    section.appendChild(buildKpiCard(def));
  });
}
