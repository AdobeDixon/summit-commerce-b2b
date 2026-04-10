import { readBlockConfig } from '../../scripts/aem.js';
import {
  CUSTOMER_ACCOUNT_PATH,
  CUSTOMER_LOGIN_PATH,
  CUSTOMER_ORDER_DETAILS_PATH,
  checkIsAuthenticated,
  getCodeAssetUrl,
  rootLink,
} from '../../scripts/commerce.js';
import { fetchInvoicesPage } from './invoices-service.js';
import { buildNav, toggleNav } from '../bodea-dashboard/dashboard-nav.js';

import '../../scripts/initializers/account.js';

const DEFAULT_PAGE_SIZE = 10;
const PDF_MODULE_URL = 'https://esm.sh/jspdf@4.2.0';

/** Design tokens (aligned with styles/styles.css) */
const PDF = {
  bannerBg: [28, 25, 23],
  accent: [161, 98, 7],
  accent2: [87, 83, 78],
  ink: [31, 41, 51],
  muted: [82, 91, 102],
  border: [226, 232, 240],
  surface: [248, 250, 252],
  zebra: [252, 252, 253],
};

let pdfModulePromise;

function getPageSize(block) {
  const { 'page-size': pageSizeConfig = `${DEFAULT_PAGE_SIZE}` } = readBlockConfig(block);
  const pageSize = Number.parseInt(pageSizeConfig, 10);

  if (Number.isNaN(pageSize) || pageSize < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(pageSize, 50);
}

function formatInvoiceDate(dateStr) {
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

function formatInvoiceStatus(status) {
  if (!status) return null;

  return status
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getInvoiceStatusVariant(status) {
  const key = status?.toLowerCase?.();

  if (['paid', 'captured', 'complete'].includes(key)) return 'complete';
  if (['pending', 'open'].includes(key)) return 'pending';
  if (['canceled', 'cancelled', 'void'].includes(key)) return 'canceled';

  return 'neutral';
}

function buildSkeletonRows(count = 5) {
  return Array.from({ length: count }, () => `
    <tr class="commerce-invoices-list__row commerce-invoices-list__row--skeleton">
      <td><span class="commerce-invoices-list__skeleton-line"></span></td>
      <td><span class="commerce-invoices-list__skeleton-line"></span></td>
      <td><span class="commerce-invoices-list__skeleton-line"></span></td>
      <td><span class="commerce-invoices-list__skeleton-line"></span></td>
      <td><span class="commerce-invoices-list__skeleton-line"></span></td>
      <td><span class="commerce-invoices-list__skeleton-button"></span></td>
    </tr>
  `).join('');
}

function buildTopBar(navElement) {
  const topBar = document.createElement('div');
  topBar.className = 'commerce-invoices-shell__topbar';
  const logoSrc = getCodeAssetUrl('/images/bodea-inc-logo-white.png');
  topBar.innerHTML = `
    <button class="commerce-invoices-shell__menu-btn" aria-label="Toggle navigation" type="button">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
    <a class="commerce-invoices-shell__brand-mark" href="${rootLink('/')}" aria-label="Bodea home">
      <img
        class="commerce-invoices-shell__brand-mark-img"
        src="${logoSrc}"
        alt=""
        width="96"
      />
    </a>
    <div class="commerce-invoices-shell__topbar-copy">
      <span class="commerce-invoices-shell__eyebrow">Customer Portal</span>
      <h1 class="commerce-invoices-shell__page-title">Invoices</h1>
    </div>
    <a class="commerce-invoices-shell__account-link" href="${rootLink(CUSTOMER_ACCOUNT_PATH)}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      <span class="commerce-invoices-shell__account-name">My Account</span>
    </a>
  `;

  topBar.querySelector('.commerce-invoices-shell__menu-btn')
    .addEventListener('click', () => toggleNav(navElement));

  return topBar;
}

function setTopBarCustomerName(block, customer) {
  const name = [customer?.firstname, customer?.lastname].filter(Boolean).join(' ');
  const label = name || 'My Account';
  const nameEl = block.querySelector('.commerce-invoices-shell__account-name');

  if (nameEl) {
    nameEl.textContent = label;
  }
}

function renderShell(block) {
  document.body.classList.add('dashboard-page');
  block.innerHTML = '';
  block.classList.add('commerce-invoices-list', 'commerce-invoices-shell');

  const nav = buildNav(window.location.pathname);
  block.appendChild(nav);

  const main = document.createElement('div');
  main.className = 'commerce-invoices-shell__main';

  const topBar = buildTopBar(nav);
  main.appendChild(topBar);

  const page = document.createElement('div');
  page.className = 'commerce-invoices-shell__page';
  page.innerHTML = `
    <div class="commerce-invoices-list__card">
      <div class="commerce-invoices-list__hero">
        <div class="commerce-invoices-list__hero-copy">
          <span class="commerce-invoices-list__hero-eyebrow">Account</span>
          <h2 class="commerce-invoices-list__hero-title">Invoices</h2>
          <p class="commerce-invoices-list__hero-text">Download invoice PDFs and review your invoice history.</p>
        </div>
        <span class="commerce-invoices-list__hero-badge" aria-live="polite">Loading…</span>
      </div>
      <div class="commerce-invoices-list__filters">
        <label for="commerce-invoices-month-filter" class="commerce-invoices-list__filter-label">Month</label>
        <select id="commerce-invoices-month-filter" class="commerce-invoices-list__month-select" aria-label="Filter by month">
          <option value="">All months</option>
        </select>
      </div>
      <div class="commerce-invoices-list__content">
        <div class="commerce-invoices-list__table-wrap">
          <table class="commerce-invoices-list__table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Order</th>
                <th>Date</th>
                <th>Status</th>
                <th>Currency</th>
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
  const meta = block.querySelector('.commerce-invoices-list__hero-badge');
  if (meta) meta.textContent = text;
}

function getJsPdfConstructor() {
  if (!pdfModulePromise) {
    pdfModulePromise = import(PDF_MODULE_URL).then((module) => module.jsPDF);
  }

  return pdfModulePromise;
}

function ensurePageSpace(doc, currentY, requiredHeight, margin) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerReserve = 40;

  if (currentY + requiredHeight <= pageHeight - margin - footerReserve) {
    return currentY;
  }

  doc.addPage();
  return margin;
}

/**
 * Load Bodea logo for PDF (same asset as dashboard nav).
 * @returns {Promise<string|null>} data URL or null
 */
async function fetchInvoicePdfLogoDataUrl() {
  try {
    const url = getCodeAssetUrl('/images/bodea-inc-logo-white.png');
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('[CommerceInvoicesList] Invoice PDF logo fetch failed:', err);
    return null;
  }
}

/**
 * @param {string} dataUrl
 * @returns {Promise<{ w: number, h: number }>}
 */
function getImageNaturalSizeFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('Logo decode failed'));
    img.src = dataUrl;
  });
}

/**
 * Dark branded banner with optional logo and invoice number.
 * @returns {number} Y position where body content should start
 */
function drawPdfBanner(doc, pageWidth, margin, invoice, logoDataUrl, logoSizePt) {
  const bannerH = 92;
  const [r, g, b] = PDF.bannerBg;
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, pageWidth, bannerH, 'F');

  const stripH = 3;
  const [ar, ag, ab] = PDF.accent;
  doc.setFillColor(ar, ag, ab);
  doc.rect(0, bannerH - stripH, pageWidth * 0.55, stripH, 'F');
  const [r2, g2, b2] = PDF.accent2;
  doc.setFillColor(r2, g2, b2);
  doc.rect(pageWidth * 0.55, bannerH - stripH, pageWidth * 0.45, stripH, 'F');

  doc.setTextColor(255, 255, 255);

  if (logoDataUrl && logoSizePt?.w && logoSizePt?.h) {
    try {
      doc.addImage(
        logoDataUrl,
        'PNG',
        margin,
        (bannerH - logoSizePt.h) / 2,
        logoSizePt.w,
        logoSizePt.h,
      );
    } catch (e) {
      console.warn('[CommerceInvoicesList] PDF addImage logo failed:', e);
    }
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('SALES INVOICE', pageWidth - margin, 34, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text(`#${invoice.number}`, pageWidth - margin, 58, { align: 'right' });

  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  return bannerH + 22;
}

/**
 * Invoice + customer metadata in a light panel (two balanced columns).
 * @returns {number} Next Y after panel and divider
 */
function drawPdfInvoiceDetails(doc, margin, pageWidth, startY, invoice, customer) {
  const contentWidth = pageWidth - (margin * 2);
  const pad = 14;
  const labelW = 78;
  const colGap = 28;
  const colW = (contentWidth - pad * 2 - colGap) / 2;
  const valueMaxW = colW - labelW;

  const customerName = customer
    ? [customer.firstname, customer.lastname].filter(Boolean).join(' ')
    : '—';

  const leftCol = [
    ['Order', invoice.orderNumber ? `#${invoice.orderNumber}` : '—'],
    ['Invoice date', formatInvoiceDate(invoice.invoiceDate)],
    ['Status', formatInvoiceStatus(invoice.invoiceStatus) ?? '—'],
  ];
  const rightCol = [
    ['Currency', invoice.currency ?? '—'],
    ['Bill to', customerName],
    ['Email', customer?.email ?? '—'],
  ];

  const measureColHeight = (rows) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    let h = pad + 11;
    rows.forEach(([, value]) => {
      const lines = doc.splitTextToSize(String(value), valueMaxW);
      h += Math.max(16, lines.length * 12 + 4);
    });
    return h + 6;
  };

  const boxH = Math.max(measureColHeight(leftCol), measureColHeight(rightCol));
  const [sr, sg, sb] = PDF.surface;
  doc.setFillColor(sr, sg, sb);
  doc.rect(margin, startY, contentWidth, boxH, 'F');
  const [br, bg, bb] = PDF.border;
  doc.setDrawColor(br, bg, bb);
  doc.setLineWidth(0.5);
  doc.rect(margin, startY, contentWidth, boxH, 'S');

  const drawCol = (rows, colX) => {
    let y = startY + pad + 11;
    rows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
      doc.text(label, colX, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
      const lines = doc.splitTextToSize(String(value), valueMaxW);
      doc.text(lines, colX + labelW, y);
      y += Math.max(16, lines.length * 12 + 4);
    });
  };

  const xLeft = margin + pad;
  const xRight = margin + pad + colW + colGap;
  drawCol(leftCol, xLeft);
  drawCol(rightCol, xRight);

  const bottomY = startY + boxH + 18;
  doc.setDrawColor(br, bg, bb);
  doc.line(margin, bottomY, pageWidth - margin, bottomY);

  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  return bottomY + 16;
}

function addPdfFooters(doc, marginPt) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const total = doc.getNumberOfPages();

  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 113, 108);
    doc.text('Bodea · Smart. Simple. Fast.', marginPt, pageHeight - 28);
    doc.text(
      `Page ${i} of ${total}`,
      pageWidth - marginPt,
      pageHeight - 28,
      { align: 'right' },
    );
  }
}

async function downloadInvoicePdf(button, invoice, customer) {
  const originalLabel = button.innerHTML;

  try {
    button.disabled = true;
    button.textContent = 'Preparing PDF…';

    const logoDataUrl = await fetchInvoicePdfLogoDataUrl();
    let logoSizePt = null;
    if (logoDataUrl) {
      try {
        const { w, h } = await getImageNaturalSizeFromDataUrl(logoDataUrl);
        if (w > 0 && h > 0) {
          const maxW = 125;
          logoSizePt = { w: maxW, h: (maxW * h) / w };
        }
      } catch {
        logoSizePt = null;
      }
    }

    const JsPdfDocument = await getJsPdfConstructor();
    const doc = new JsPdfDocument({
      unit: 'pt',
      format: 'a4',
    });

    const margin = 48;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - (margin * 2);

    let cursorY = drawPdfBanner(doc, pageWidth, margin, invoice, logoDataUrl, logoSizePt);
    cursorY = drawPdfInvoiceDetails(doc, margin, pageWidth, cursorY, invoice, customer);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
    doc.text('Line items', margin, cursorY);
    cursorY += 20;

    if (!invoice.items.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
      doc.text(
        'No invoice line items were returned by Commerce for this invoice.',
        margin,
        cursorY,
      );
    } else {
      const headH = 26;
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, cursorY, contentWidth, headH, 'F');
      const [br, bg, bb] = PDF.border;
      doc.setDrawColor(br, bg, bb);
      doc.setLineWidth(0.4);
      doc.rect(margin, cursorY, contentWidth, headH, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
      doc.text('PRODUCT', margin + 10, cursorY + 17);
      doc.text('SKU', margin + 292, cursorY + 17);
      doc.text('QTY', pageWidth - margin - 10, cursorY + 17, { align: 'right' });
      cursorY += headH + 4;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);

      invoice.items.forEach((item, index) => {
        const productLines = doc.splitTextToSize(item.name || 'Product', 250);
        const skuLines = doc.splitTextToSize(item.sku || '—', 130);
        const rowHeight = Math.max(productLines.length, skuLines.length) * 12 + 16;

        cursorY = ensurePageSpace(doc, cursorY, rowHeight + 12, margin);

        if (index % 2 === 0) {
          const [zr, zg, zb] = PDF.zebra;
          doc.setFillColor(zr, zg, zb);
          doc.rect(margin, cursorY - 4, contentWidth, rowHeight + 4, 'F');
        }

        doc.text(productLines, margin + 10, cursorY + 10);
        doc.text(skuLines, margin + 292, cursorY + 10);
        doc.text(String(item.quantityInvoiced ?? 0), pageWidth - margin - 10, cursorY + 10, {
          align: 'right',
        });

        cursorY += rowHeight;
        doc.setDrawColor(241, 245, 249);
        doc.line(margin, cursorY - 2, pageWidth - margin, cursorY - 2);
      });
    }

    addPdfFooters(doc, margin);
    doc.save(`invoice-${invoice.number}.pdf`);
  } catch (error) {
    console.error('[CommerceInvoicesList] PDF generation failed:', error);
    button.textContent = 'PDF unavailable';
    window.setTimeout(() => {
      button.innerHTML = originalLabel;
      button.disabled = false;
    }, 1500);
    return;
  }

  button.innerHTML = originalLabel;
  button.disabled = false;
}

function buildDownloadButton(invoice) {
  if (!invoice.hasPdf) {
    return '<span class="commerce-invoices-list__action-disabled">Unavailable</span>';
  }

  return `
    <button class="commerce-invoices-list__download" type="button" data-invoice-id="${invoice.id}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Download PDF
    </button>
  `;
}

function renderTable(block, state) {
  const filteredInvoices = filterInvoicesByMonth(state.invoices, state.selectedMonthFilter);
  const tbody = filteredInvoices.map((invoice) => {
    const status = formatInvoiceStatus(invoice.invoiceStatus);
    const orderHref = invoice.orderNumber
      ? rootLink(`${CUSTOMER_ORDER_DETAILS_PATH}?orderRef=${invoice.orderNumber}`)
      : '';

    return `
      <tr class="commerce-invoices-list__row">
        <td><span class="commerce-invoices-list__invoice-number">#${invoice.number}</span></td>
        <td>
          ${orderHref
    ? `<a class="commerce-invoices-list__order-link" href="${orderHref}">#${invoice.orderNumber}</a>`
    : '—'}
        </td>
        <td>${formatInvoiceDate(invoice.invoiceDate)}</td>
        <td>
          ${status
    ? `<span class="commerce-invoices-list__status" data-status="${getInvoiceStatusVariant(invoice.invoiceStatus)}">${status}</span>`
    : '—'}
        </td>
        <td>${invoice.currency ?? '—'}</td>
        <td>${buildDownloadButton(invoice)}</td>
      </tr>
    `;
  }).join('');

  const footer = [];

  if (state.footerError) {
    footer.push(`<p class="commerce-invoices-list__footer-message">${state.footerError}</p>`);
  }

  if (state.currentPage < state.totalPages) {
    footer.push(`
      <button class="commerce-invoices-list__load-more" type="button" ${state.loadingMore ? 'disabled' : ''}>
        ${state.loadingMore ? 'Loading…' : 'Load More'}
      </button>
    `);
  }

  block.querySelector('.commerce-invoices-list__content').innerHTML = `
    <div class="commerce-invoices-list__table-wrap">
      <table class="commerce-invoices-list__table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Order</th>
            <th>Date</th>
            <th>Status</th>
            <th>Currency</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
    ${footer.length ? `<div class="commerce-invoices-list__footer">${footer.join('')}</div>` : ''}
  `;

  block.querySelectorAll('.commerce-invoices-list__download').forEach((button) => {
    const invoice = state.invoices.find((entry) => entry.id === button.dataset.invoiceId);
    if (!invoice) return;

    button.addEventListener('click', () => downloadInvoicePdf(button, invoice, state.customer));
  });

  const loadMoreButton = block.querySelector('.commerce-invoices-list__load-more');
  if (loadMoreButton) {
    loadMoreButton.addEventListener('click', () => state.loadMore());
  }
}

function renderEmptyState(block, message) {
  block.querySelector('.commerce-invoices-list__content').innerHTML = `
    <div class="commerce-invoices-list__state">
      <p class="commerce-invoices-list__state-message">${message}</p>
    </div>
  `;
}

function renderErrorState(block, retry) {
  block.querySelector('.commerce-invoices-list__content').innerHTML = `
    <div class="commerce-invoices-list__state">
      <p class="commerce-invoices-list__state-message">We could not load invoices right now.</p>
      <button class="commerce-invoices-list__retry" type="button">Try Again</button>
    </div>
  `;

  block.querySelector('.commerce-invoices-list__retry').addEventListener('click', retry);
}

function dedupeInvoices(invoices) {
  const seen = new Set();

  return invoices.filter((invoice) => {
    const key = invoice.id || invoice.number;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function getUniqueMonthsFromInvoices(invoices) {
  const monthSet = new Map();

  invoices.forEach((invoice) => {
    if (!invoice.invoiceDate) return;
    const date = new Date(invoice.invoiceDate);
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

function filterInvoicesByMonth(invoices, monthFilter) {
  if (!monthFilter) return invoices;
  const [year, month] = monthFilter.split('-').map(Number);
  return invoices.filter((invoice) => {
    if (!invoice.invoiceDate) return false;
    const date = new Date(invoice.invoiceDate);
    if (Number.isNaN(date.getTime())) return false;
    return date.getFullYear() === year && date.getMonth() + 1 === month;
  });
}

function renderMonthFilter(block, state) {
  const filterWrap = block.querySelector('.commerce-invoices-list__filters');
  const select = filterWrap?.querySelector('.commerce-invoices-list__month-select');
  if (!select) return;

  const months = getUniqueMonthsFromInvoices(state.invoices);
  select.innerHTML = `
    <option value="">All months</option>
    ${months.map((m) => `<option value="${m.value}">${m.label}</option>`).join('')}
  `;
  select.value = state.selectedMonthFilter || '';

  if (!select.dataset.monthFilterBound) {
    select.dataset.monthFilterBound = 'true';
    select.addEventListener('change', () => {
      state.selectedMonthFilter = select.value || null;
      const filtered = filterInvoicesByMonth(state.invoices, state.selectedMonthFilter);
      setMeta(
        block,
        filtered.length
          ? `${filtered.length} invoice${filtered.length === 1 ? '' : 's'}`
          : 'No invoices',
      );
      if (filtered.length === 0) {
        renderEmptyState(block, state.selectedMonthFilter ? 'No invoices for this month.' : 'No invoices available yet.');
      } else {
        renderTable(block, state);
      }
    });
  }
}

export default async function decorate(block) {
  block.classList.add('commerce-invoices-list');

  if (!checkIsAuthenticated()) {
    window.location.href = rootLink(CUSTOMER_LOGIN_PATH);
    return;
  }

  renderShell(block);

  const state = {
    customer: null,
    invoices: [],
    currentPage: 0,
    totalPages: 0,
    pageSize: getPageSize(block),
    loadingMore: false,
    footerError: '',
    selectedMonthFilter: null,
    async loadInitial() {
      const result = await fetchInvoicesPage(1, state.pageSize);

      if (!result || result.error) {
        setMeta(block, 'Unavailable');
        renderErrorState(block, state.loadInitial);
        return;
      }

      state.customer = result.customer;
      state.invoices = result.invoices;
      state.currentPage = result.pagination.currentPage;
      state.totalPages = result.pagination.totalPages;
      state.footerError = '';

      setTopBarCustomerName(block, state.customer);

      renderMonthFilter(block, state);

      const filtered = filterInvoicesByMonth(state.invoices, state.selectedMonthFilter);
      setMeta(
        block,
        filtered.length
          ? `${filtered.length} invoice${filtered.length === 1 ? '' : 's'}`
          : 'No invoices',
      );

      if (!state.invoices.length) {
        renderEmptyState(block, 'No invoices available yet.');
        return;
      }

      if (filtered.length === 0) {
        renderEmptyState(block, state.selectedMonthFilter ? 'No invoices for this month.' : 'No invoices available yet.');
        return;
      }

      renderTable(block, state);
    },
    async loadMore() {
      if (state.loadingMore || state.currentPage >= state.totalPages) return;

      state.loadingMore = true;
      state.footerError = '';
      renderTable(block, state);

      const result = await fetchInvoicesPage(state.currentPage + 1, state.pageSize);
      state.loadingMore = false;

      if (!result || result.error) {
        state.footerError = 'We could not load more invoices right now.';
        renderTable(block, state);
        return;
      }

      state.customer = state.customer || result.customer;
      state.currentPage = result.pagination.currentPage;
      state.totalPages = result.pagination.totalPages;
      state.invoices = dedupeInvoices([...state.invoices, ...result.invoices]);

      renderMonthFilter(block, state);

      const filtered = filterInvoicesByMonth(state.invoices, state.selectedMonthFilter);
      setMeta(block, `${filtered.length} invoice${filtered.length === 1 ? '' : 's'}`);
      renderTable(block, state);
    },
  };

  await state.loadInitial();
}
