/**
 * Bodea Dashboard – Equipment Overview Section
 *
 * Renders featured pallet cards with stock indicators and a link
 * to the order/equipment flow.
 *
 * DATA:
 * - Product name: real from Commerce catalog
 * - Stock status: real (IN_STOCK / OUT_OF_STOCK)
 * - Qty: real where available (stock_item.qty or only_x_left_in_stock)
 *   Falls back to capacity-relative display when qty is unavailable.
 */

import { rootLink } from '../../scripts/commerce.js';
import { EQUIPMENT_DISPLAY_NAMES, EQUIPMENT_STOCK_CAPACITY, FEATURED_EQUIPMENT_SKUS } from './dashboard-config.js';

/* ── Equipment type icons (material-based) ─────────────────────────────── */

const EQUIPMENT_ICONS = {
  wood: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="14" width="20" height="4" rx="1" fill="rgba(3,105,161,0.08)"/>
    <path d="M4 14V8h16v6"/>
    <path d="M8 8V5M12 8V5M16 8V5"/>
    <path d="M6 18v2M18 18v2"/>
    <path d="M4 11h16"/>
  </svg>`,
  plastic: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="13" width="20" height="5" rx="1.5" fill="rgba(3,105,161,0.08)"/>
    <path d="M5 13V7h14v6"/>
    <path d="M2 13h20"/>
    <rect x="4" y="8" width="4" height="5" rx="0.5"/>
    <rect x="10" y="8" width="4" height="5" rx="0.5"/>
    <rect x="16" y="8" width="4" height="5" rx="0.5"/>
    <path d="M5 18v2M19 18v2"/>
  </svg>`,
  'wood-metal': `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="14" width="20" height="4" rx="1" fill="rgba(3,105,161,0.08)" stroke-dasharray="4 2"/>
    <path d="M4 14V8h16v6"/>
    <path d="M7 8V5M12 8V5M17 8V5"/>
    <path d="M4 11h16"/>
    <path d="M6 18v2M18 18v2"/>
  </svg>`,
};

function getEquipmentIcon(sku) {
  if (sku.includes('PLASTIC')) return EQUIPMENT_ICONS.plastic;
  if (sku.includes('METAL')) return EQUIPMENT_ICONS['wood-metal'];
  return EQUIPMENT_ICONS.wood;
}

/* ── Stock bar ─────────────────────────────────────────────────────────── */

function buildMiniStockBar(product) {
  const capacity = EQUIPMENT_STOCK_CAPACITY[product.sku] ?? 500;
  const qty = product?.qty ?? null;
  const isOut = product?.stockStatus === 'OUT_OF_STOCK';

  if (isOut) {
    return '<div class="equip-card__stock-bar equip-card__stock-bar--out" style="width:100%"></div>';
  }

  const ratio = qty !== null ? Math.min(qty / capacity, 1) : 0.5;
  const pct = Math.round(ratio * 100);

  let variant;
  if (ratio > 0.5) {
    variant = 'good';
  } else if (ratio > 0.25) {
    variant = 'warning';
  } else {
    variant = 'critical';
  }

  return `<div class="equip-card__stock-bar equip-card__stock-bar--${variant}" style="width:${pct}%"></div>`;
}

/* ── Single equipment card ─────────────────────────────────────────────── */

function buildEquipmentCard(product) {
  const displayName = EQUIPMENT_DISPLAY_NAMES[product.sku] ?? product.name ?? product.sku;
  const capacity = EQUIPMENT_STOCK_CAPACITY[product.sku] ?? 500;
  const { qty } = product;
  const isOut = product.stockStatus === 'OUT_OF_STOCK';

  let qtyDisplay;
  if (qty !== null) {
    qtyDisplay = `${qty.toLocaleString()} available`;
  } else if (isOut) {
    qtyDisplay = 'Out of stock';
  } else {
    qtyDisplay = 'In stock';
  }

  const qtyNote = !product.qtyIsReal && qty !== null
    ? ' (est.)'
    : '';

  const card = document.createElement('article');
  card.className = `equip-card${isOut ? ' equip-card--out' : ''}`;

  card.innerHTML = `
    <div class="equip-card__icon">
      ${getEquipmentIcon(product.sku)}
    </div>
    <div class="equip-card__body">
      <h3 class="equip-card__name">${displayName}</h3>
      <div class="equip-card__qty">
        <span class="equip-card__qty-value">${qtyDisplay}${qtyNote}</span>
        ${capacity ? `<span class="equip-card__qty-capacity">(${capacity.toLocaleString()} cap.)</span>` : ''}
      </div>
      <div class="equip-card__bar-track">
        ${buildMiniStockBar(product)}
      </div>
      <a href="${rootLink('/order')}" class="equip-card__cta">Order now</a>
    </div>
  `;

  return card;
}

/* ── Skeleton card ─────────────────────────────────────────────────────── */

function buildSkeletonCard() {
  const card = document.createElement('article');
  card.className = 'equip-card equip-card--skeleton';
  card.innerHTML = `
    <div class="equip-card__icon">
      <div class="skeleton-block" style="width:36px;height:36px;border-radius:6px"></div>
    </div>
    <div class="equip-card__body">
      <div class="skeleton-line" style="width:80%;height:14px;margin-bottom:8px"></div>
      <div class="skeleton-line" style="width:55%;height:12px;margin-bottom:10px"></div>
      <div class="skeleton-line" style="width:100%;height:6px;border-radius:3px"></div>
    </div>
  `;
  return card;
}

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Build the Equipment Overview section with skeleton cards.
 * @returns {HTMLElement}
 */
export function buildEquipmentSection() {
  const section = document.createElement('section');
  section.className = 'dashboard-equipment';
  section.setAttribute('aria-label', 'Equipment overview');

  const header = document.createElement('div');
  header.className = 'panel-header';
  header.innerHTML = `
    <h2 class="panel-header__title">Equipment Overview</h2>
    <a href="${rootLink('/order')}" class="panel-header__view-all">
      Order Equipment
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </a>
  `;
  section.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'equip-grid equip-grid--loading';

  /* Show first 4 SKUs as skeletons */
  FEATURED_EQUIPMENT_SKUS.slice(0, 4).forEach(() => {
    grid.appendChild(buildSkeletonCard());
  });

  section.appendChild(grid);
  return section;
}

/**
 * Replace skeleton cards with real equipment data.
 * @param {HTMLElement} section
 * @param {object[]|null} stockData - from DashboardService.fetchEquipmentStock()
 */
export function updateEquipmentSection(section, stockData) {
  const grid = section.querySelector('.equip-grid');
  if (!grid) return;

  grid.innerHTML = '';
  grid.classList.remove('equip-grid--loading');

  if (!stockData || !stockData.length) {
    /* Fallback: render cards using config data only (name from EQUIPMENT_DISPLAY_NAMES) */
    FEATURED_EQUIPMENT_SKUS.slice(0, 4).forEach((sku) => {
      const fallback = {
        sku,
        name: EQUIPMENT_DISPLAY_NAMES[sku] ?? sku,
        stockStatus: 'IN_STOCK',
        qty: null,
        qtyIsReal: false,
      };
      grid.appendChild(buildEquipmentCard(fallback));
    });
    return;
  }

  /* Show up to 4 featured products, preserving the config order */
  const productMap = Object.fromEntries(stockData.map((p) => [p.sku, p]));

  FEATURED_EQUIPMENT_SKUS.slice(0, 4).forEach((sku) => {
    const product = productMap[sku] ?? {
      sku,
      name: EQUIPMENT_DISPLAY_NAMES[sku] ?? sku,
      stockStatus: 'IN_STOCK',
      qty: null,
      qtyIsReal: false,
    };
    grid.appendChild(buildEquipmentCard(product));
  });
}
