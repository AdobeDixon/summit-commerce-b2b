import { readBlockConfig } from '../../scripts/aem.js';
import {
  CUSTOMER_ACCOUNT_PATH,
  CUSTOMER_LOGIN_PATH,
  CUSTOMER_ORDER_DETAILS_PATH,
  checkIsAuthenticated,
  rootLink,
} from '../../scripts/commerce.js';
import { fetchInvoicesPage } from './invoices-service.js';
import { buildNav, toggleNav } from '../chep-dashboard/dashboard-nav.js';

import '../../scripts/initializers/account.js';

const DEFAULT_PAGE_SIZE = 10;
const PDF_MODULE_URL = 'https://esm.sh/jspdf@4.2.0';

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
  topBar.innerHTML = `
    <button class="commerce-invoices-shell__menu-btn" aria-label="Toggle navigation" type="button">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
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

  if (currentY + requiredHeight <= pageHeight - margin) {
    return currentY;
  }

  doc.addPage();
  return margin;
}

function addPdfHeader(doc, margin, y, customer, invoice) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(`Invoice ${invoice.number}`, margin, y);

  let cursorY = y + 26;
  const metadata = [
    ['Order Number', invoice.orderNumber ?? '—'],
    ['Invoice Date', formatInvoiceDate(invoice.invoiceDate)],
    ['Status', formatInvoiceStatus(invoice.invoiceStatus) ?? 'Not provided'],
    ['Currency', invoice.currency ?? 'Not provided'],
    [
      'Customer',
      customer
        ? [customer.firstname, customer.lastname].filter(Boolean).join(' ')
        : 'Customer',
    ],
    ['Email', customer?.email ?? 'Not provided'],
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(82, 91, 102);

  metadata.forEach(([label, value]) => {
    doc.text(`${label}: ${value}`, margin, cursorY);
    cursorY += 16;
  });

  doc.setDrawColor(228, 231, 235);
  doc.line(margin, cursorY + 6, doc.internal.pageSize.getWidth() - margin, cursorY + 6);

  return cursorY + 24;
}

async function downloadInvoicePdf(button, invoice, customer) {
  const originalLabel = button.innerHTML;

  try {
    button.disabled = true;
    button.textContent = 'Preparing PDF…';

    const JsPdfDocument = await getJsPdfConstructor();
    const doc = new JsPdfDocument({
      unit: 'pt',
      format: 'a4',
    });

    const margin = 48;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - (margin * 2);

    let cursorY = addPdfHeader(doc, margin, margin + 8, customer, invoice);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(31, 41, 51);
    doc.text('Invoice Items', margin, cursorY);
    cursorY += 18;

    if (!invoice.items.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(82, 91, 102);
      doc.text(
        'No invoice line items were returned by Commerce for this invoice.',
        margin,
        cursorY,
      );
    } else {
      doc.setFillColor(246, 248, 250);
      doc.rect(margin, cursorY, contentWidth, 22, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(82, 91, 102);
      doc.text('Product', margin + 8, cursorY + 14);
      doc.text('SKU', margin + 300, cursorY + 14);
      doc.text('Qty', pageWidth - margin - 32, cursorY + 14, { align: 'right' });
      cursorY += 30;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(31, 41, 51);

      invoice.items.forEach((item) => {
        const productLines = doc.splitTextToSize(item.name || 'Product', 220);
        const skuLines = doc.splitTextToSize(item.sku || '—', 120);
        const rowHeight = Math.max(productLines.length, skuLines.length) * 12 + 14;

        cursorY = ensurePageSpace(doc, cursorY, rowHeight + 14, margin);

        doc.text(productLines, margin + 8, cursorY);
        doc.text(skuLines, margin + 300, cursorY);
        doc.text(String(item.quantityInvoiced ?? 0), pageWidth - margin - 8, cursorY, {
          align: 'right',
        });

        cursorY += rowHeight;
        doc.setDrawColor(240, 242, 245);
        doc.line(margin, cursorY - 6, pageWidth - margin, cursorY - 6);
        cursorY += 8;
      });
    }

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
  const tbody = state.invoices.map((invoice) => {
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

      setMeta(
        block,
        state.invoices.length
          ? `${state.invoices.length} invoice${state.invoices.length === 1 ? '' : 's'}`
          : 'No invoices',
      );

      if (!state.invoices.length) {
        renderEmptyState(block, 'No invoices available yet.');
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

      setMeta(block, `${state.invoices.length} invoice${state.invoices.length === 1 ? '' : 's'}`);
      renderTable(block, state);
    },
  };

  await state.loadInitial();
}
