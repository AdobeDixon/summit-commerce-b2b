import { readBlockConfig } from '../../scripts/aem.js';
import {
  CUSTOMER_ACCOUNT_PATH,
  CUSTOMER_LOGIN_PATH,
  CUSTOMER_ORDER_DETAILS_PATH,
  checkIsAuthenticated,
  rootLink,
} from '../../scripts/commerce.js';
import { fetchOrdersPage } from './orders-service.js';
import { buildNav, toggleNav } from '../bodea-dashboard/dashboard-nav.js';
import { renderBrickProductIcon } from '../order-new-delivery/brick-product-icon.js';
import { getEquipmentProductBySku } from '../order-new-delivery/equipment-products.js';
import { ORDER_STATUS_MAP } from '../bodea-dashboard/dashboard-config.js';

import '../../scripts/initializers/account.js';

const DEFAULT_PAGE_SIZE = 10;
const TABLE_COL_COUNT = 7;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getMaterialFromSku(sku) {
  const product = getEquipmentProductBySku(sku);
  return product?.material ?? 'clay-common';
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
    icons.push(renderBrickProductIcon(material, { className: 'bodea-orders-list__brick-icon' }));
    if (icons.length >= 4) break;
  }

  if (icons.length === 0) return '—';
  return `<span class="bodea-orders-list__product-preview" role="img" aria-label="Product types">${icons.join('')}</span>`;
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

function formatOrderTotal(total) {
  if (total == null || total.value == null || Number.isNaN(Number(total.value))) {
    return '—';
  }
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: total.currency && total.currency !== 'NONE' ? total.currency : 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(total.value));
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

function getStatusLabel(status) {
  const key = status?.toLowerCase?.().replace(/\s+/g, '_');
  const mapping = ORDER_STATUS_MAP[key];
  return mapping?.label ?? (status ?? 'Unknown');
}

function getUniqueMonthsFromOrders(orders) {
  const monthSet = new Map();
  orders.forEach((order) => {
    if (!order.orderDate) return;
    const date = new Date(order.orderDate);
    if (Number.isNaN(date.getTime())) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthSet.has(key)) {
      monthSet.set(key, {
        value: key,
        label: `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`,
      });
    }
  });
  return Array.from(monthSet.values())
    .sort((a, b) => b.value.localeCompare(a.value));
}

function getUniqueStatusesFromOrders(orders) {
  const map = new Map();
  orders.forEach((order) => {
    const key = order.status;
    if (!key || map.has(key)) return;
    map.set(key, {
      value: key,
      label: getStatusLabel(key),
    });
  });
  return Array.from(map.values())
    .sort((a, b) => a.label.localeCompare(b.label));
}

function filterOrdersByMonth(orders, monthFilter) {
  if (!monthFilter) return orders;
  const [year, month] = monthFilter.split('-').map(Number);
  return orders.filter((order) => {
    if (!order.orderDate) return false;
    const date = new Date(order.orderDate);
    if (Number.isNaN(date.getTime())) return false;
    return date.getFullYear() === year && date.getMonth() + 1 === month;
  });
}

function buildOrderSearchHaystack(order) {
  const parts = [
    String(order.number ?? ''),
    order.location ?? '',
    ...(order.items ?? []).flatMap((item) => [item.name, item.sku].filter(Boolean)),
  ];
  if (order.total?.value != null) {
    parts.push(String(order.total.value), formatOrderTotal(order.total));
  }
  return parts.join(' ').toLowerCase();
}

function orderMatchesSearchQuery(order, rawQuery) {
  const q = (rawQuery || '').trim().toLowerCase();
  if (!q) return true;
  const hay = buildOrderSearchHaystack(order);
  return q.split(/\s+/).filter(Boolean).every((token) => {
    const bare = token.startsWith('#') ? token.slice(1) : token;
    return hay.includes(token) || hay.includes(bare);
  });
}

function applyOrderFilters(orders, filterState) {
  let list = orders;
  list = filterOrdersByMonth(list, filterState.selectedMonthFilter);
  if (filterState.selectedStatusFilter) {
    list = list.filter((o) => o.status === filterState.selectedStatusFilter);
  }
  list = list.filter((o) => orderMatchesSearchQuery(o, filterState.searchQuery));
  return list;
}

function hasActiveFilters(filterState) {
  const q = (filterState.searchQuery || '').trim();
  return Boolean(
    q || filterState.selectedMonthFilter || filterState.selectedStatusFilter,
  );
}

function syncFilterControls(block, state) {
  const monthSelect = block.querySelector('#bodea-orders-month-filter');
  const statusSelect = block.querySelector('#bodea-orders-status-filter');
  const searchInput = block.querySelector('#bodea-orders-search');
  if (!monthSelect || !statusSelect) return;

  const months = getUniqueMonthsFromOrders(state.orders);
  const prevMonth = state.selectedMonthFilter;
  monthSelect.innerHTML = `
    <option value="">All months</option>
    ${months.map((m) => `<option value="${escapeHtml(m.value)}">${escapeHtml(m.label)}</option>`).join('')}
  `;
  const monthOk = !prevMonth || months.some((m) => m.value === prevMonth);
  state.selectedMonthFilter = monthOk ? prevMonth : null;
  monthSelect.value = state.selectedMonthFilter || '';

  const statuses = getUniqueStatusesFromOrders(state.orders);
  const prevStatus = state.selectedStatusFilter;
  statusSelect.innerHTML = `
    <option value="">All statuses</option>
    ${statuses.map((s) => `<option value="${escapeHtml(s.value)}">${escapeHtml(s.label)}</option>`).join('')}
  `;
  const statusOk = !prevStatus || statuses.some((s) => s.value === prevStatus);
  state.selectedStatusFilter = statusOk ? prevStatus : null;
  statusSelect.value = state.selectedStatusFilter || '';

  if (searchInput) {
    searchInput.value = state.searchQuery || '';
  }
}

function syncFilterToolbarVisibility(block, state) {
  const clearBtn = block.querySelector('.bodea-orders-list__filters-clear');
  const hint = block.querySelector('.bodea-orders-list__filters-hint');
  if (clearBtn) {
    clearBtn.hidden = !hasActiveFilters(state);
  }
  if (hint) {
    const showHint = state.orders.length > 0 && state.currentPage < state.totalPages;
    hint.hidden = !showHint;
  }
}

function updateOrderListMeta(block, state) {
  const meta = block.querySelector('.bodea-orders-list__hero-badge');
  if (!meta) return;

  if (!state.orders.length) {
    meta.textContent = 'No orders';
    return;
  }

  const filtered = applyOrderFilters(state.orders, state).length;
  const loaded = state.orders.length;
  const active = hasActiveFilters(state);

  if (!active) {
    meta.textContent = loaded === 1 ? '1 order' : `${loaded} orders`;
    return;
  }

  if (filtered === 0) {
    meta.textContent = 'No matches';
    return;
  }

  if (filtered === loaded) {
    meta.textContent = loaded === 1 ? '1 order' : `${loaded} orders`;
    return;
  }

  meta.textContent = filtered === 1
    ? `1 of ${loaded} orders`
    : `${filtered} of ${loaded} orders`;
}

function applyFiltersFromUi(block, state) {
  const searchInput = block.querySelector('#bodea-orders-search');
  const monthSelect = block.querySelector('#bodea-orders-month-filter');
  const statusSelect = block.querySelector('#bodea-orders-status-filter');
  state.searchQuery = searchInput?.value ?? '';
  state.selectedMonthFilter = monthSelect?.value || null;
  state.selectedStatusFilter = statusSelect?.value || null;
  updateOrderListMeta(block, state);
  renderTable(block, state);
  syncFilterToolbarVisibility(block, state);
}

function clearFilters(block, state) {
  state.searchQuery = '';
  state.selectedMonthFilter = null;
  state.selectedStatusFilter = null;
  const searchInput = block.querySelector('#bodea-orders-search');
  const monthSelect = block.querySelector('#bodea-orders-month-filter');
  const statusSelect = block.querySelector('#bodea-orders-status-filter');
  if (searchInput) searchInput.value = '';
  if (monthSelect) monthSelect.value = '';
  if (statusSelect) statusSelect.value = '';
  updateOrderListMeta(block, state);
  renderTable(block, state);
  syncFilterToolbarVisibility(block, state);
}

function attachFilterHandlers(block, state) {
  if (block.dataset.bodeaOrdersFiltersBound === 'true') return;
  block.dataset.bodeaOrdersFiltersBound = 'true';

  const onApply = () => applyFiltersFromUi(block, state);
  block.querySelector('#bodea-orders-search')
    ?.addEventListener('input', onApply);
  block.querySelector('#bodea-orders-month-filter')
    ?.addEventListener('change', onApply);
  block.querySelector('#bodea-orders-status-filter')
    ?.addEventListener('change', onApply);
  block.querySelector('.bodea-orders-list__filters-clear')
    ?.addEventListener('click', () => clearFilters(block, state));
  block.addEventListener('click', (e) => {
    if (e.target.closest('.bodea-orders-list__no-match-clear')) {
      clearFilters(block, state);
    }
  });
}

function buildSkeletonRows(count = 5) {
  return Array.from({ length: count }, () => `
    <tr class="bodea-orders-list__row bodea-orders-list__row--skeleton">
      <td><span class="bodea-orders-list__skeleton-line"></span></td>
      <td><span class="bodea-orders-list__skeleton-line"></span></td>
      <td><span class="bodea-orders-list__skeleton-line"></span></td>
      <td><span class="bodea-orders-list__skeleton-line"></span></td>
      <td class="bodea-orders-list__col-total"><span class="bodea-orders-list__skeleton-line"></span></td>
      <td><span class="bodea-orders-list__skeleton-line"></span></td>
      <td><span class="bodea-orders-list__skeleton-line"></span></td>
    </tr>
  `).join('');
}

function buildTopBar(navElement) {
  const topBar = document.createElement('div');
  topBar.className = 'bodea-orders-list__topbar';
  topBar.innerHTML = `
    <button class="bodea-orders-list__menu-btn" aria-label="Toggle navigation" type="button">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
    <div class="bodea-orders-list__topbar-copy">
      <span class="bodea-orders-list__eyebrow">Customer Portal</span>
      <h1 class="bodea-orders-list__page-title">Orders</h1>
    </div>
    <a class="bodea-orders-list__account-link" href="${rootLink(CUSTOMER_ACCOUNT_PATH)}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      <span class="bodea-orders-list__account-name">My Account</span>
    </a>
  `;

  topBar.querySelector('.bodea-orders-list__menu-btn')
    .addEventListener('click', () => toggleNav(navElement));

  return topBar;
}

function setTopBarCustomerName(block, customer) {
  const name = [customer?.firstname, customer?.lastname].filter(Boolean).join(' ');
  const label = name || 'My Account';
  const nameEl = block.querySelector('.bodea-orders-list__account-name');

  if (nameEl) {
    nameEl.textContent = label;
  }
}

function renderShell(block) {
  document.body.classList.add('dashboard-page');
  block.innerHTML = '';
  block.classList.add('bodea-orders-list', 'bodea-orders-list-shell');

  const nav = buildNav(window.location.pathname);
  block.appendChild(nav);

  const main = document.createElement('div');
  main.className = 'bodea-orders-list__main';

  const topBar = buildTopBar(nav);
  main.appendChild(topBar);

  const page = document.createElement('div');
  page.className = 'bodea-orders-list__page';
  page.innerHTML = `
    <div class="bodea-orders-list__card">
      <div class="bodea-orders-list__hero">
        <div class="bodea-orders-list__hero-copy">
          <span class="bodea-orders-list__hero-eyebrow">Account</span>
          <h2 class="bodea-orders-list__hero-title">Orders</h2>
          <p class="bodea-orders-list__hero-text">View all your delivery orders and track their status.</p>
        </div>
        <span class="bodea-orders-list__hero-badge" aria-live="polite">Loading…</span>
      </div>
      <div class="bodea-orders-list__filters" aria-label="Filter orders">
        <div class="bodea-orders-list__filters-row">
          <div class="bodea-orders-list__filter-field bodea-orders-list__filter-field--search">
            <label for="bodea-orders-search" class="bodea-orders-list__filter-label">Search</label>
            <input
              id="bodea-orders-search"
              class="bodea-orders-list__search-input"
              type="search"
              name="bodea-orders-search"
              placeholder="Order #, location, SKU, product…"
              autocomplete="off"
              enterkeyhint="search"
            />
          </div>
          <div class="bodea-orders-list__filter-field">
            <label for="bodea-orders-month-filter" class="bodea-orders-list__filter-label">Month</label>
            <select id="bodea-orders-month-filter" class="bodea-orders-list__filter-select" aria-label="Filter by month">
              <option value="">All months</option>
            </select>
          </div>
          <div class="bodea-orders-list__filter-field">
            <label for="bodea-orders-status-filter" class="bodea-orders-list__filter-label">Status</label>
            <select id="bodea-orders-status-filter" class="bodea-orders-list__filter-select" aria-label="Filter by status">
              <option value="">All statuses</option>
            </select>
          </div>
          <div class="bodea-orders-list__filter-field bodea-orders-list__filter-field--action">
            <button type="button" class="bodea-orders-list__filters-clear" hidden>Clear filters</button>
          </div>
        </div>
        <p class="bodea-orders-list__filters-hint" hidden>
          Filters apply to orders loaded so far. Load more to include older orders in search.
        </p>
      </div>
      <div class="bodea-orders-list__content">
        <div class="bodea-orders-list__table-wrap">
          <table class="bodea-orders-list__table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Date</th>
                <th>Location</th>
                <th>Products</th>
                <th class="bodea-orders-list__col-total">Total</th>
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
  const meta = block.querySelector('.bodea-orders-list__hero-badge');
  if (meta) meta.textContent = text;
}

function renderTable(block, state) {
  const filteredOrders = applyOrderFilters(state.orders, state);
  let tbody;

  if (state.orders.length > 0 && filteredOrders.length === 0) {
    tbody = `
      <tr class="bodea-orders-list__row bodea-orders-list__row--no-match">
        <td colspan="${TABLE_COL_COUNT}">
          <div class="bodea-orders-list__no-match">
            <p class="bodea-orders-list__no-match-message">No orders match your filters.</p>
            <button type="button" class="bodea-orders-list__no-match-clear">Clear filters</button>
          </div>
        </td>
      </tr>
    `;
  } else {
    tbody = filteredOrders.map((order) => {
      const detailHref = rootLink(`${CUSTOMER_ORDER_DETAILS_PATH}?orderRef=${order.number}`);
      const statusVariant = getOrderStatusVariant(order.status);
      const statusLabel = getStatusLabel(order.status);

      return `
      <tr class="bodea-orders-list__row">
        <td><a class="bodea-orders-list__order-link" href="${detailHref}">#${order.number}</a></td>
        <td>${formatOrderDate(order.orderDate)}</td>
        <td><span class="bodea-orders-list__location" title="${order.location ?? ''}">${order.location ?? '—'}</span></td>
        <td>${buildProductPreviewIcons(order.items)}</td>
        <td class="bodea-orders-list__col-total">${formatOrderTotal(order.total)}</td>
        <td>
          <span class="bodea-orders-list__status" data-status="${statusVariant}">${statusLabel}</span>
        </td>
        <td>
          <a class="bodea-orders-list__view" href="${detailHref}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            View
          </a>
        </td>
      </tr>
    `;
    }).join('');
  }

  const footer = [];

  if (state.footerError) {
    footer.push(`<p class="bodea-orders-list__footer-message">${state.footerError}</p>`);
  }

  if (state.currentPage < state.totalPages) {
    footer.push(`
      <button class="bodea-orders-list__load-more" type="button" ${state.loadingMore ? 'disabled' : ''}>
        ${state.loadingMore ? 'Loading…' : 'Load More'}
      </button>
    `);
  }

  block.querySelector('.bodea-orders-list__content').innerHTML = `
    <div class="bodea-orders-list__table-wrap">
      <table class="bodea-orders-list__table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Date</th>
            <th>Location</th>
            <th>Products</th>
            <th class="bodea-orders-list__col-total">Total</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
    ${footer.length ? `<div class="bodea-orders-list__footer">${footer.join('')}</div>` : ''}
  `;

  const loadMoreButton = block.querySelector('.bodea-orders-list__load-more');
  if (loadMoreButton) {
    loadMoreButton.addEventListener('click', () => state.loadMore());
  }

  syncFilterToolbarVisibility(block, state);
}

function renderEmptyState(block, message, state) {
  block.querySelector('.bodea-orders-list__content').innerHTML = `
    <div class="bodea-orders-list__state">
      <p class="bodea-orders-list__state-message">${message}</p>
      <a class="bodea-orders-list__cta" href="${rootLink('/order')}">Create Order</a>
    </div>
  `;
  if (state) {
    syncFilterToolbarVisibility(block, state);
  }
}

function renderErrorState(block, retry) {
  block.querySelector('.bodea-orders-list__content').innerHTML = `
    <div class="bodea-orders-list__state">
      <p class="bodea-orders-list__state-message">We could not load orders right now.</p>
      <button class="bodea-orders-list__retry" type="button">Try Again</button>
    </div>
  `;

  block.querySelector('.bodea-orders-list__retry').addEventListener('click', retry);
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
  block.classList.add('bodea-orders-list');

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
    searchQuery: '',
    selectedMonthFilter: null,
    selectedStatusFilter: null,
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
      syncFilterControls(block, state);
      updateOrderListMeta(block, state);

      if (!state.orders.length) {
        renderEmptyState(
          block,
          'No orders yet. Create your first delivery order to get started.',
          state,
        );
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

      syncFilterControls(block, state);
      updateOrderListMeta(block, state);
      renderTable(block, state);
    },
  };

  attachFilterHandlers(block, state);

  await state.loadInitial();
}
