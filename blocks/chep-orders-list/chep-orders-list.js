import { readBlockConfig } from '../../scripts/aem.js';
import {
  CUSTOMER_ACCOUNT_PATH,
  CUSTOMER_LOGIN_PATH,
  CUSTOMER_ORDER_DETAILS_PATH,
  checkIsAuthenticated,
  rootLink,
} from '../../scripts/commerce.js';
import { fetchOrdersPage } from './orders-service.js';
import { buildNav, toggleNav } from '../chep-dashboard/dashboard-nav.js';
import { getEquipmentProductBySku } from '../order-new-delivery/equipment-products.js';
import { ORDER_STATUS_MAP } from '../chep-dashboard/dashboard-config.js';

import '../../scripts/initializers/account.js';

const DEFAULT_PAGE_SIZE = 10;

function renderPalletIcon(material) {
  const colors = {
    wood: '#c68642',
    'wood-metal': '#8a9bb0',
    plastic: '#1fa6e8',
  };
  const c = colors[material] || colors.wood;
  return `<svg class="chep-orders-list__pallet-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="2" y="9" width="28" height="3.5" rx="1" fill="${c}"/>
    <rect x="2" y="14.5" width="28" height="3.5" rx="1" fill="${c}" opacity="0.75"/>
    <rect x="2" y="19" width="28" height="3.5" rx="1" fill="${c}" opacity="0.5"/>
    <rect x="2" y="22.5" width="7" height="5.5" rx="1" fill="${c}" opacity="0.65"/>
    <rect x="12.5" y="22.5" width="7" height="5.5" rx="1" fill="${c}" opacity="0.65"/>
    <rect x="23" y="22.5" width="7" height="5.5" rx="1" fill="${c}" opacity="0.65"/>
  </svg>`;
}

function getMaterialFromSku(sku) {
  const product = getEquipmentProductBySku(sku);
  return product?.material ?? 'wood';
}

function buildProductPreviewIcons(items) {
  if (!items?.length) return '—';

  const seen = new Set();
  const icons = [];
  for (const item of items) {
    const sku = item.sku;
    if (!sku || seen.has(sku)) continue;
    seen.add(sku);
    const material = getMaterialFromSku(sku);
    icons.push(renderPalletIcon(material));
    if (icons.length >= 4) break;
  }

  if (icons.length === 0) return '—';
  return `<span class="chep-orders-list__product-preview" role="img" aria-label="Product types">${icons.join('')}</span>`;
}

function getPageSize(block) {
  const { 'page-size': pageSizeConfig = `${DEFAULT_PAGE_SIZE}` } = readBlockConfig(block);
  const pageSize = Number.parseInt(pageSizeConfig, 10);

  if (Number.isNaN(pageSize) || pageSize < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(pageSize, 50);
}

function formatOrderDate(dateStr) {
  if (!dateStr) return '—';

  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '—';

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return '—';
  }
}

function getOrderStatusVariant(status) {
  const key = status?.toLowerCase?.().replace(/\s+/g, '_');
  const mapping = ORDER_STATUS_MAP[key];
  if (mapping) return mapping.variant;
  if (['complete', 'closed', 'canceled'].includes(key)) return 'complete';
  if (['pending', 'processing'].includes(key)) return 'pending';
  return 'neutral';
}

function buildSkeletonRows(count = 5) {
  return Array.from({ length: count }, () => `
    <tr class="chep-orders-list__row chep-orders-list__row--skeleton">
      <td><span class="chep-orders-list__skeleton-line"></span></td>
      <td><span class="chep-orders-list__skeleton-line"></span></td>
      <td><span class="chep-orders-list__skeleton-line"></span></td>
      <td><span class="chep-orders-list__skeleton-line"></span></td>
      <td><span class="chep-orders-list__skeleton-line"></span></td>
      <td><span class="chep-orders-list__skeleton-line"></span></td>
    </tr>
  `).join('');
}

function buildTopBar(navElement) {
  const topBar = document.createElement('div');
  topBar.className = 'chep-orders-list__topbar';
  topBar.innerHTML = `
    <button class="chep-orders-list__menu-btn" aria-label="Toggle navigation" type="button">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
    <div class="chep-orders-list__topbar-copy">
      <span class="chep-orders-list__eyebrow">Customer Portal</span>
      <h1 class="chep-orders-list__page-title">Orders</h1>
    </div>
    <a class="chep-orders-list__account-link" href="${rootLink(CUSTOMER_ACCOUNT_PATH)}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      <span class="chep-orders-list__account-name">My Account</span>
    </a>
  `;

  topBar.querySelector('.chep-orders-list__menu-btn')
    .addEventListener('click', () => toggleNav(navElement));

  return topBar;
}

function setTopBarCustomerName(block, customer) {
  const name = [customer?.firstname, customer?.lastname].filter(Boolean).join(' ');
  const label = name || 'My Account';
  const nameEl = block.querySelector('.chep-orders-list__account-name');

  if (nameEl) {
    nameEl.textContent = label;
  }
}

function renderShell(block) {
  document.body.classList.add('dashboard-page');
  block.innerHTML = '';
  block.classList.add('chep-orders-list', 'chep-orders-list-shell');

  const nav = buildNav(window.location.pathname);
  block.appendChild(nav);

  const main = document.createElement('div');
  main.className = 'chep-orders-list__main';

  const topBar = buildTopBar(nav);
  main.appendChild(topBar);

  const page = document.createElement('div');
  page.className = 'chep-orders-list__page';
  page.innerHTML = `
    <div class="chep-orders-list__card">
      <div class="chep-orders-list__hero">
        <div class="chep-orders-list__hero-copy">
          <span class="chep-orders-list__hero-eyebrow">Account</span>
          <h2 class="chep-orders-list__hero-title">Orders</h2>
          <p class="chep-orders-list__hero-text">View all your delivery orders and track their status.</p>
        </div>
        <span class="chep-orders-list__hero-badge" aria-live="polite">Loading…</span>
      </div>
      <div class="chep-orders-list__content">
        <div class="chep-orders-list__table-wrap">
          <table class="chep-orders-list__table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Date</th>
                <th>Location</th>
                <th>Products</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${buildSkeletonRows()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  main.appendChild(page);
  block.appendChild(main);
}

function setMeta(block, text) {
  const meta = block.querySelector('.chep-orders-list__hero-badge');
  if (meta) meta.textContent = text;
}

function getStatusLabel(status) {
  const key = status?.toLowerCase?.().replace(/\s+/g, '_');
  const mapping = ORDER_STATUS_MAP[key];
  return mapping?.label ?? (status ?? 'Unknown');
}

function renderTable(block, state) {
  const tbody = state.orders.map((order) => {
    const detailHref = rootLink(`${CUSTOMER_ORDER_DETAILS_PATH}?orderRef=${order.number}`);
    const statusVariant = getOrderStatusVariant(order.status);
    const statusLabel = getStatusLabel(order.status);

    return `
      <tr class="chep-orders-list__row">
        <td><a class="chep-orders-list__order-link" href="${detailHref}">#${order.number}</a></td>
        <td>${formatOrderDate(order.orderDate)}</td>
        <td><span class="chep-orders-list__location" title="${order.location ?? ''}">${order.location ?? '—'}</span></td>
        <td>${buildProductPreviewIcons(order.items)}</td>
        <td>
          <span class="chep-orders-list__status" data-status="${statusVariant}">${statusLabel}</span>
        </td>
        <td>
          <a class="chep-orders-list__view" href="${detailHref}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            View
          </a>
        </td>
      </tr>
    `;
  }).join('');

  const footer = [];

  if (state.footerError) {
    footer.push(`<p class="chep-orders-list__footer-message">${state.footerError}</p>`);
  }

  if (state.currentPage < state.totalPages) {
    footer.push(`
      <button class="chep-orders-list__load-more" type="button" ${state.loadingMore ? 'disabled' : ''}>
        ${state.loadingMore ? 'Loading…' : 'Load More'}
      </button>
    `);
  }

  block.querySelector('.chep-orders-list__content').innerHTML = `
    <div class="chep-orders-list__table-wrap">
      <table class="chep-orders-list__table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Date</th>
            <th>Location</th>
            <th>Products</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
    ${footer.length ? `<div class="chep-orders-list__footer">${footer.join('')}</div>` : ''}
  `;

  const loadMoreButton = block.querySelector('.chep-orders-list__load-more');
  if (loadMoreButton) {
    loadMoreButton.addEventListener('click', () => state.loadMore());
  }
}

function renderEmptyState(block, message) {
  block.querySelector('.chep-orders-list__content').innerHTML = `
    <div class="chep-orders-list__state">
      <p class="chep-orders-list__state-message">${message}</p>
      <a class="chep-orders-list__cta" href="${rootLink('/order')}">Create Order</a>
    </div>
  `;
}

function renderErrorState(block, retry) {
  block.querySelector('.chep-orders-list__content').innerHTML = `
    <div class="chep-orders-list__state">
      <p class="chep-orders-list__state-message">We could not load orders right now.</p>
      <button class="chep-orders-list__retry" type="button">Try Again</button>
    </div>
  `;

  block.querySelector('.chep-orders-list__retry').addEventListener('click', retry);
}

function dedupeOrders(orders) {
  const seen = new Set();
  return orders.filter((order) => {
    const key = order.number;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default async function decorate(block) {
  block.classList.add('chep-orders-list');

  if (!checkIsAuthenticated()) {
    const returnUrl = encodeURIComponent(window.location.pathname || '/order-list');
    window.location.href = `${rootLink(CUSTOMER_LOGIN_PATH)}?returnUrl=${returnUrl}`;
    return;
  }

  renderShell(block);

  const state = {
    customer: null,
    orders: [],
    currentPage: 0,
    totalPages: 0,
    pageSize: getPageSize(block),
    loadingMore: false,
    footerError: '',
    async loadInitial() {
      const result = await fetchOrdersPage(1, state.pageSize);

      if (!result || result.error) {
        setMeta(block, 'Unavailable');
        renderErrorState(block, state.loadInitial);
        return;
      }

      state.customer = result.customer;
      state.orders = result.orders;
      state.currentPage = result.pagination.currentPage;
      state.totalPages = result.pagination.totalPages;
      state.footerError = '';

      setTopBarCustomerName(block, state.customer);

      setMeta(
        block,
        state.orders.length
          ? `${state.orders.length} order${state.orders.length === 1 ? '' : 's'}`
          : 'No orders',
      );

      if (!state.orders.length) {
        renderEmptyState(block, 'No orders yet. Create your first delivery order to get started.');
        return;
      }

      renderTable(block, state);
    },
    async loadMore() {
      if (state.loadingMore || state.currentPage >= state.totalPages) return;

      state.loadingMore = true;
      state.footerError = '';
      renderTable(block, state);

      const result = await fetchOrdersPage(state.currentPage + 1, state.pageSize);
      state.loadingMore = false;

      if (!result || result.error) {
        state.footerError = 'We could not load more orders right now.';
        renderTable(block, state);
        return;
      }

      state.customer = state.customer || result.customer;
      state.currentPage = result.pagination.currentPage;
      state.totalPages = result.pagination.totalPages;
      state.orders = dedupeOrders([...state.orders, ...result.orders]);

      setMeta(block, `${state.orders.length} order${state.orders.length === 1 ? '' : 's'}`);
      renderTable(block, state);
    },
  };

  await state.loadInitial();
}
