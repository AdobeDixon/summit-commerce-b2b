/**
 * CHEP Dashboard – Recent Orders Panel
 *
 * Renders the "Recent Orders" card including a table of the latest orders,
 * status pills, and a "View All" link.
 *
 * DATA: Real Commerce customer orders via DashboardService.fetchOrders().
 * If not authenticated, shows a sign-in prompt.
 * If no orders exist, shows an empty state.
 */

import { ORDER_STATUS_MAP } from './dashboard-config.js';
import {
  rootLink,
  CUSTOMER_ORDERS_PATH,
  CUSTOMER_ORDER_DETAILS_PATH,
  CUSTOMER_LOGIN_PATH,
} from '../../scripts/commerce.js';

/* ── Date formatting ───────────────────────────────────────────────────── */

function formatOrderDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const daysDiff = Math.floor((today - date) / 86400000);
    if (daysDiff < 7) return days[date.getDay()];
    return `${date.getDate()} ${months[date.getMonth()]}`;
  } catch {
    return '—';
  }
}

/* ── Status pill ───────────────────────────────────────────────────────── */

function buildStatusPill(rawStatus) {
  const statusKey = rawStatus?.toLowerCase().replace(/\s+/g, '_');
  const mapping = ORDER_STATUS_MAP[statusKey] ?? { label: rawStatus ?? 'Unknown', variant: 'neutral' };

  const pill = document.createElement('span');
  pill.className = `status-pill status-pill--${mapping.variant}`;
  pill.textContent = mapping.label;
  return pill;
}

/* ── Skeleton rows ─────────────────────────────────────────────────────── */

function buildSkeletonRow() {
  const tr = document.createElement('tr');
  tr.className = 'orders-table__row orders-table__row--skeleton';
  for (let i = 0; i < 5; i += 1) {
    const td = document.createElement('td');
    td.innerHTML = `<span class="skeleton-line" style="width:${60 + i * 15}%"></span>`;
    tr.appendChild(td);
  }
  return tr;
}

/* ── Order row ─────────────────────────────────────────────────────────── */

function buildOrderRow(order) {
  const tr = document.createElement('tr');
  tr.className = 'orders-table__row';

  const detailHref = rootLink(`${CUSTOMER_ORDER_DETAILS_PATH}?orderRef=${order.number}`);

  const equipmentSummary = order.items.slice(0, 2).map((i) => i.name).join(', ')
    || order.primaryEquipment
    || '—';

  tr.innerHTML = `
    <td class="orders-table__cell orders-table__cell--number">
      <a href="${detailHref}" class="orders-table__order-link">#${order.number}</a>
    </td>
    <td class="orders-table__cell orders-table__cell--date">${formatOrderDate(order.orderDate)}</td>
    <td class="orders-table__cell orders-table__cell--location">
      <span class="orders-table__location-text" title="${order.location ?? ''}">
        ${order.location ?? '—'}
      </span>
    </td>
    <td class="orders-table__cell orders-table__cell--equipment">
      <span class="orders-table__equipment-text" title="${equipmentSummary}">
        ${equipmentSummary}
      </span>
    </td>
    <td class="orders-table__cell orders-table__cell--status"></td>
  `;

  tr.querySelector('.orders-table__cell--status').appendChild(
    buildStatusPill(order.statusLabel),
  );

  return tr;
}

/* ── Panel sections ────────────────────────────────────────────────────── */

function buildPanelHeader(viewAllHref) {
  const header = document.createElement('div');
  header.className = 'panel-header';
  header.innerHTML = `
    <h2 class="panel-header__title">Recent Orders</h2>
    <a href="${viewAllHref}" class="panel-header__view-all">
      View All
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </a>
  `;
  return header;
}

function buildEmptyState(message, ctaLabel, ctaHref) {
  const empty = document.createElement('div');
  empty.className = 'panel-empty';
  empty.innerHTML = `
    <div class="panel-empty__icon">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
      </svg>
    </div>
    <p class="panel-empty__message">${message}</p>
    ${ctaHref ? `<a href="${ctaHref}" class="panel-empty__cta">${ctaLabel}</a>` : ''}
  `;
  return empty;
}

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Build the orders panel with skeleton loading state.
 * @returns {HTMLElement}
 */
export function buildOrdersSection() {
  const section = document.createElement('section');
  section.className = 'dashboard-panel dashboard-orders';
  section.setAttribute('aria-label', 'Recent orders');

  const header = buildPanelHeader(rootLink(CUSTOMER_ORDERS_PATH));
  section.appendChild(header);

  /* Skeleton table */
  const table = document.createElement('table');
  table.className = 'orders-table orders-table--loading';
  table.innerHTML = `
    <thead>
      <tr class="orders-table__head-row">
        <th class="orders-table__th">Order</th>
        <th class="orders-table__th">Date</th>
        <th class="orders-table__th">Location</th>
        <th class="orders-table__th">Equipment</th>
        <th class="orders-table__th">Status</th>
      </tr>
    </thead>
    <tbody class="orders-table__body"></tbody>
  `;

  const tbody = table.querySelector('.orders-table__body');
  for (let i = 0; i < 5; i += 1) {
    tbody.appendChild(buildSkeletonRow());
  }

  section.appendChild(table);
  return section;
}

/**
 * Populate the orders panel with real data.
 * @param {HTMLElement} section
 * @param {object|null} ordersData - from DashboardService.fetchOrders()
 * @param {boolean} isAuthenticated
 */
export function updateOrdersSection(section, ordersData, isAuthenticated) {
  /* Remove existing table/empty state */
  section.querySelectorAll('.orders-table, .panel-empty').forEach((el) => el.remove());

  if (!isAuthenticated) {
    section.appendChild(
      buildEmptyState(
        'Sign in to view your recent orders.',
        'Sign In',
        rootLink(CUSTOMER_LOGIN_PATH),
      ),
    );
    return;
  }

  if (!ordersData || !ordersData.orders?.length) {
    section.appendChild(
      buildEmptyState(
        'No orders found. Start by creating a new delivery order.',
        'Create Order',
        rootLink('/order-new-delivery'),
      ),
    );
    return;
  }

  const table = document.createElement('table');
  table.className = 'orders-table';
  table.innerHTML = `
    <thead>
      <tr class="orders-table__head-row">
        <th class="orders-table__th">Order</th>
        <th class="orders-table__th">Date</th>
        <th class="orders-table__th">Location</th>
        <th class="orders-table__th">Equipment</th>
        <th class="orders-table__th">Status</th>
      </tr>
    </thead>
    <tbody class="orders-table__body"></tbody>
  `;

  const tbody = table.querySelector('.orders-table__body');
  ordersData.orders.slice(0, 6).forEach((order) => {
    tbody.appendChild(buildOrderRow(order));
  });

  section.appendChild(table);
}
