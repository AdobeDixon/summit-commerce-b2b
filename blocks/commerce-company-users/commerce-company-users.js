/** ******************************************************************
 * ADOBE CONFIDENTIAL
 * __________________
 *
 *  Copyright 2025 Adobe
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe and its suppliers, if any. The intellectual
 * and technical concepts contained herein are proprietary to Adobe
 * and its suppliers and are protected by all applicable intellectual
 * property laws, including trade secret and copyright laws.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe.
 ****************************************************************** */
import { CompanyUsers } from '@dropins/storefront-company-management/containers/CompanyUsers.js';
import { RolesAndPermissions } from '@dropins/storefront-company-management/containers/RolesAndPermissions.js';
import { render as companyRenderer } from '@dropins/storefront-company-management/render.js';
import { companyEnabled, getCompany } from '@dropins/storefront-company-management/api.js';
import {
  CUSTOMER_LOGIN_PATH,
  CUSTOMER_ACCOUNT_PATH,
  checkIsAuthenticated,
  rootLink,
} from '../../scripts/commerce.js';
import { buildNav, toggleNav } from '../chep-dashboard/dashboard-nav.js';

import '../../scripts/initializers/company.js';

const DEFAULT_VIEW = 'users';

const VIEW_CONFIG = {
  users: {
    label: 'Users',
    eyebrow: 'Directory',
    title: 'Company Users',
    description: 'View active and inactive users, invite colleagues, edit profiles, and manage account status without leaving this workspace.',
    ctaLabel: 'Add New User',
    ctaSelector: '.addUserButtonContainer button',
  },
  roles: {
    label: 'Roles & Permissions',
    eyebrow: 'Access Control',
    title: 'Roles & Permissions',
    description: 'Create roles, assign permissions, and update access rules for your company team from the same branded module.',
    ctaLabel: 'Add New Role',
    ctaSelector: '.add-role-section button',
  },
};

function getInitialView() {
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get('view');
  return VIEW_CONFIG[requestedView] ? requestedView : DEFAULT_VIEW;
}

function updateViewInUrl(view) {
  const url = new URL(window.location.href);

  if (view === DEFAULT_VIEW) {
    url.searchParams.delete('view');
  } else {
    url.searchParams.set('view', view);
  }

  window.history.replaceState({}, '', url);
}

function renderState(target, config) {
  const {
    eyebrow = 'Company Management',
    title,
    message,
    actionHref = rootLink(CUSTOMER_ACCOUNT_PATH),
    actionLabel = 'Return to My Account',
  } = config;

  target.innerHTML = `
    <div class="commerce-company-users__state-card">
      <span class="commerce-company-users__state-eyebrow">${eyebrow}</span>
      <h2 class="commerce-company-users__state-title">${title}</h2>
      <p class="commerce-company-users__state-message">${message}</p>
      <a class="commerce-company-users__state-action" href="${actionHref}">${actionLabel}</a>
    </div>
  `;
}

function buildTopBar(navElement) {
  const topBar = document.createElement('div');
  topBar.className = 'commerce-company-users-shell__topbar';
  topBar.innerHTML = `
    <button class="commerce-company-users-shell__menu-btn" aria-label="Toggle navigation" type="button">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
    <div class="commerce-company-users-shell__topbar-copy">
      <span class="commerce-company-users-shell__eyebrow">Customer Portal</span>
      <h1 class="commerce-company-users-shell__page-title">Company Users</h1>
    </div>
    <a class="commerce-company-users-shell__account-link" href="${rootLink(CUSTOMER_ACCOUNT_PATH)}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      <span class="commerce-company-users-shell__account-name">My Account</span>
    </a>
  `;
  topBar.querySelector('.commerce-company-users-shell__menu-btn')
    .addEventListener('click', () => toggleNav(navElement));
  return topBar;
}

function buildShell(activeView) {
  return `
    <div class="commerce-company-users__hero">
      <div class="commerce-company-users__hero-copy">
        <span class="commerce-company-users__hero-eyebrow">Company Administration</span>
        <h1 class="commerce-company-users__hero-title">Company Users</h1>
        <p class="commerce-company-users__hero-text">Manage users, invitations, roles, and permissions inside the same branded portal experience.</p>
      </div>
      <div class="commerce-company-users__hero-badge">Adobe Commerce B2B</div>
    </div>
    <section class="commerce-company-users__module" aria-label="Company users workspace">
      <div class="commerce-company-users__toolbar">
        <div class="commerce-company-users__tabs" role="tablist" aria-label="Company management views">
          <button class="commerce-company-users__tab" type="button" role="tab" data-view="users" aria-selected="${activeView === 'users'}">
            <span class="commerce-company-users__tab-label">${VIEW_CONFIG.users.label}</span>
            <span class="commerce-company-users__tab-copy">User directory and account status</span>
          </button>
          <button class="commerce-company-users__tab" type="button" role="tab" data-view="roles" aria-selected="${activeView === 'roles'}">
            <span class="commerce-company-users__tab-label">${VIEW_CONFIG.roles.label}</span>
            <span class="commerce-company-users__tab-copy">Role setup and permission control</span>
          </button>
        </div>
        <button class="commerce-company-users__primary-action" type="button" hidden></button>
      </div>
      <div class="commerce-company-users__section-intro">
        <span class="commerce-company-users__section-eyebrow"></span>
        <h2 class="commerce-company-users__section-title"></h2>
        <p class="commerce-company-users__section-description"></p>
      </div>
      <div class="commerce-company-users__panels">
        <div class="commerce-company-users__panel" data-view="users" role="tabpanel"></div>
        <div class="commerce-company-users__panel" data-view="roles" role="tabpanel"></div>
      </div>
    </section>
  `;
}

function extractShellElements(block) {
  return {
    tabs: [...block.querySelectorAll('.commerce-company-users__tab')],
    primaryAction: block.querySelector('.commerce-company-users__primary-action'),
    sectionEyebrow: block.querySelector('.commerce-company-users__section-eyebrow'),
    sectionTitle: block.querySelector('.commerce-company-users__section-title'),
    sectionDescription: block.querySelector('.commerce-company-users__section-description'),
    panels: {
      users: block.querySelector('.commerce-company-users__panel[data-view="users"]'),
      roles: block.querySelector('.commerce-company-users__panel[data-view="roles"]'),
    },
  };
}

function mountLoadingState(panel, label) {
  panel.innerHTML = `
    <div class="commerce-company-users__panel-loading" aria-live="polite">
      <div class="commerce-company-users__loading-dot"></div>
      <p>Loading ${label}…</p>
    </div>
  `;
}

function syncPrimaryAction(elements, activeView) {
  const actionConfig = VIEW_CONFIG[activeView];
  const target = elements.panels[activeView].querySelector(actionConfig.ctaSelector);

  if (!target) {
    elements.primaryAction.hidden = true;
    return;
  }

  elements.primaryAction.hidden = false;
  elements.primaryAction.textContent = actionConfig.ctaLabel;
}

function createActionObserver(elements, view) {
  const observer = new MutationObserver(() => {
    const currentView = elements.tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.dataset.view;

    if (currentView === view) {
      syncPrimaryAction(elements, view);
    }
  });

  observer.observe(elements.panels[view], {
    childList: true,
    subtree: true,
  });

  return observer;
}

async function mountUsersPanel(panel) {
  await companyRenderer.render(CompanyUsers, {})(panel);
}

async function mountRolesPanel(panel) {
  await companyRenderer.render(RolesAndPermissions, {})(panel);
}

export default async function decorate(block) {
  if (!checkIsAuthenticated()) {
    window.location.href = rootLink(CUSTOMER_LOGIN_PATH);
    return;
  }

  document.body.classList.add('dashboard-page', 'company-users-page');
  block.innerHTML = '';
  block.classList.add('commerce-company-users', 'commerce-company-users-shell');

  const nav = buildNav(window.location.pathname);
  block.appendChild(nav);

  const main = document.createElement('div');
  main.className = 'commerce-company-users-shell__main';
  const topBar = buildTopBar(nav);
  main.appendChild(topBar);

  const page = document.createElement('div');
  page.className = 'commerce-company-users-shell__page';

  const mountedViews = new Set();
  const activeView = getInitialView();
  page.innerHTML = buildShell(activeView);
  const elements = extractShellElements(page);

  mountLoadingState(elements.panels.users, 'company users');
  mountLoadingState(elements.panels.roles, 'roles and permissions');

  main.appendChild(page);
  block.appendChild(main);

  const updateView = async (view) => {
    const config = VIEW_CONFIG[view];

    elements.tabs.forEach((tab) => {
      const isActive = tab.dataset.view === view;
      tab.setAttribute('aria-selected', isActive);
      tab.classList.toggle('is-active', isActive);
    });

    Object.entries(elements.panels).forEach(([panelView, panel]) => {
      const isActive = panelView === view;
      panel.hidden = !isActive;
      panel.classList.toggle('is-active', isActive);
    });

    elements.sectionEyebrow.textContent = config.eyebrow;
    elements.sectionTitle.textContent = config.title;
    elements.sectionDescription.textContent = config.description;
    updateViewInUrl(view);

    if (!mountedViews.has(view)) {
      try {
        if (view === 'users') {
          await mountUsersPanel(elements.panels.users);
        } else {
          await mountRolesPanel(elements.panels.roles);
        }

        mountedViews.add(view);
      } catch (error) {
        renderState(elements.panels[view], {
          eyebrow: config.eyebrow,
          title: `${config.title} unavailable`,
          message: `We could not load the ${config.title.toLowerCase()} view right now. Please try again later.`,
        });
      }
    }

    syncPrimaryAction(elements, view);
  };

  elements.tabs.forEach((tab) => {
    tab.addEventListener('click', async () => {
      const { view } = tab.dataset;
      await updateView(view);
    });
  });

  elements.primaryAction.addEventListener('click', () => {
    const currentView = elements.tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.dataset.view || DEFAULT_VIEW;
    const config = VIEW_CONFIG[currentView];
    const target = elements.panels[currentView].querySelector(config.ctaSelector);

    if (target) {
      target.click();
      return;
    }

    elements.panels[currentView].scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  });

  const observers = [
    createActionObserver(elements, 'users'),
    createActionObserver(elements, 'roles'),
  ];

  try {
    const isCompanyEnabled = await companyEnabled();

    if (!isCompanyEnabled) {
      page.innerHTML = '';
      renderState(page, {
        title: 'Company management is unavailable',
        message: 'This storefront does not currently have company management enabled for your account.',
      });
      return;
    }

    await getCompany();
  } catch (error) {
    page.innerHTML = '';
    renderState(page, {
      title: 'Company workspace unavailable',
      message: 'We could not load the company user workspace for this account. If you should have access, contact your company administrator or try again later.',
    });
    return;
  }

  try {
    await updateView(activeView);
  } finally {
    const hasModule = page.querySelector('.commerce-company-users__module');
    const hasStateCard = page.querySelector('.commerce-company-users__state-card');
    if (!hasModule && !hasStateCard) {
      observers.forEach((observer) => observer.disconnect());
    }
  }
}
