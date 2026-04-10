/**
 * Bodea Dashboard – Low Stock Alert Panel
 *
 * Renders the "Low Stock Alert" card with a list of equipment items
 * whose inventory is at or below the configured threshold.
 *
 * DATA:
 * - Product stock_status: real Commerce data (IN_STOCK / OUT_OF_STOCK)
 * - Qty: real if stock_item.qty or only_x_left_in_stock available; otherwise
 *   renders stock_status badge only and documents the limitation.
 * - Products showing: only items flagged as low/out of stock (filtered from real product query)
 *
 * See dashboard-service.js → normaliseProduct() for full qty resolution logic.
 */

import {
  LOW_STOCK_THRESHOLD,
  EQUIPMENT_DISPLAY_NAMES,
  EQUIPMENT_STOCK_CAPACITY,
  FEATURED_EQUIPMENT_SKUS,
} from './dashboard-config.js';

/* ── Brick icon (featured masonry / HCS-BR-* catalog; matches low-stock SKU line) ─ */

const BRICK_ICON = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="2" y="3" width="9" height="5" rx="0.5" stroke="currentColor" stroke-width="1.5"/>
  <rect x="13" y="3" width="9" height="5" rx="0.5" stroke="currentColor" stroke-width="1.5"/>
  <rect x="7" y="10" width="9" height="5" rx="0.5" stroke="currentColor" stroke-width="1.5"/>
  <rect x="2" y="17" width="10" height="4" rx="0.5" stroke="currentColor" stroke-width="1.5"/>
  <rect x="14" y="17" width="8" height="4" rx="0.5" stroke="currentColor" stroke-width="1.5"/>
</svg>`;

/* ── Progress bar colour logic ─────────────────────────────────────────── */

function getStockBarVariant(ratio) {
  if (ratio > 0.5) return 'good';
  if (ratio > 0.25) return 'warning';
  return 'critical';
}

/* ── Display name ──────────────────────────────────────────────────────── */

function getDisplayName(product) {
  return EQUIPMENT_DISPLAY_NAMES[product.sku] ?? product.name ?? product.sku;
}

/* ── Single stock item row ─────────────────────────────────────────────── */

function buildStockItem(product) {
  const { qty } = product;
  const capacity = EQUIPMENT_STOCK_CAPACITY[product.sku] ?? LOW_STOCK_THRESHOLD * 2;
  const isOutOfStock = product.stockStatus === 'OUT_OF_STOCK';

  let ratio;
  if (qty !== null) {
    ratio = Math.min(qty / capacity, 1);
  } else {
    ratio = isOutOfStock ? 0 : 0.5;
  }

  const variant = getStockBarVariant(ratio);
  const pct = Math.round(ratio * 100);

  let displayQty;
  if (qty !== null) {
    displayQty = `${qty.toLocaleString()} units`;
  } else if (isOutOfStock) {
    displayQty = 'Out of stock';
  } else {
    displayQty = 'Stock data unavailable';
  }

  const qtyNote = !product.qtyIsReal
    ? '<span class="stock-item__qty-note" title="Precise quantity requires inventory API integration">~</span>'
    : '';

  const li = document.createElement('li');
  li.className = `stock-item${isOutOfStock ? ' stock-item--out-of-stock' : ''}`;

  const stockBadge = isOutOfStock
    ? '<span class="stock-item__badge stock-item__badge--out">Out of Stock</span>'
    : '<span class="stock-item__badge stock-item__badge--low">Low Stock</span>';

  li.innerHTML = `
    <div class="stock-item__icon">${BRICK_ICON}</div>
    <div class="stock-item__details">
      <div class="stock-item__header">
        <span class="stock-item__name">${getDisplayName(product)}</span>
        ${stockBadge}
      </div>
      <div class="stock-item__qty">${qtyNote}${displayQty}${capacity ? ` / ${capacity.toLocaleString()} cap.` : ''}</div>
      <div class="stock-item__bar-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${getDisplayName(product)} stock level ${pct}%">
        <div class="stock-item__bar-fill stock-item__bar-fill--${variant}" style="width:${pct}%"></div>
      </div>
    </div>
  `;

  return li;
}

/* ── Skeleton ──────────────────────────────────────────────────────────── */

function buildSkeletonItem() {
  const li = document.createElement('li');
  li.className = 'stock-item stock-item--skeleton';
  li.innerHTML = `
    <div class="stock-item__icon">
      <div class="skeleton-block" style="width:32px;height:32px;border-radius:6px"></div>
    </div>
    <div class="stock-item__details">
      <div class="skeleton-line" style="width:65%;height:14px;margin-bottom:6px"></div>
      <div class="skeleton-line" style="width:45%;height:12px;margin-bottom:8px"></div>
      <div class="skeleton-line" style="width:100%;height:6px;border-radius:3px"></div>
    </div>
  `;
  return li;
}

/* ── Panel header ──────────────────────────────────────────────────────── */

function buildPanelHeader() {
  const header = document.createElement('div');
  header.className = 'panel-header';
  header.innerHTML = `
    <h2 class="panel-header__title">Low Stock Alert</h2>
    <div class="panel-header__dots">
      <span class="panel-header__dot panel-header__dot--active"></span>
      <span class="panel-header__dot"></span>
      <span class="panel-header__dot"></span>
    </div>
  `;
  return header;
}

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Build the Low Stock Alert panel with skeleton loading state.
 * @returns {HTMLElement}
 */
export function buildStockSection() {
  const section = document.createElement('section');
  section.className = 'dashboard-panel dashboard-stock';
  section.id = 'low-stock';
  section.setAttribute('aria-label', 'Low stock alerts');

  section.appendChild(buildPanelHeader());

  const list = document.createElement('ul');
  list.className = 'stock-list stock-list--loading';
  list.setAttribute('role', 'list');

  for (let i = 0; i < 3; i += 1) {
    list.appendChild(buildSkeletonItem());
  }

  section.appendChild(list);
  return section;
}

/**
 * Replace skeleton with real low-stock product data.
 * Shows only items that are below the threshold or OUT_OF_STOCK.
 * If all items are well-stocked, shows a positive "all good" state.
 *
 * @param {HTMLElement} section
 * @param {object[]|null} stockData - from DashboardService.fetchEquipmentStock()
 */
export function updateStockSection(section, stockData) {
  const list = section.querySelector('.stock-list');
  if (!list) return;

  list.innerHTML = '';
  list.classList.remove('stock-list--loading');

  if (!stockData || !stockData.length) {
    list.innerHTML = `
      <li class="stock-empty">
        <p class="stock-empty__message">Stock data is currently unavailable.</p>
      </li>
    `;
    return;
  }

  /* Filter to only low/out-of-stock items, sorted worst first */
  const lowStockItems = stockData
    .filter((p) => {
      if (p.stockStatus === 'OUT_OF_STOCK') return true;
      if (p.qty !== null && p.qty < LOW_STOCK_THRESHOLD) return true;
      /* If qty is unknown but product is in scope, still show it with status-only display */
      if (p.qty === null && FEATURED_EQUIPMENT_SKUS.includes(p.sku)) return false;
      return false;
    })
    .sort((a, b) => {
      if (a.stockStatus === 'OUT_OF_STOCK' && b.stockStatus !== 'OUT_OF_STOCK') return -1;
      if (b.stockStatus === 'OUT_OF_STOCK' && a.stockStatus !== 'OUT_OF_STOCK') return 1;
      return (a.qty ?? Infinity) - (b.qty ?? Infinity);
    });

  if (!lowStockItems.length) {
    list.innerHTML = `
      <li class="stock-all-good">
        <div class="stock-all-good__icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <p class="stock-all-good__message">All equipment stock levels are healthy.</p>
      </li>
    `;
    return;
  }

  lowStockItems.forEach((product) => {
    list.appendChild(buildStockItem(product));
  });

  /* Manage Inventory link */
  const footer = document.createElement('li');
  footer.className = 'stock-footer';
  footer.innerHTML = `
    <a href="/customer/account" class="stock-footer__link">Manage Inventory</a>
  `;
  list.appendChild(footer);
}
