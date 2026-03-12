import { ResetPassword } from '@dropins/storefront-auth/containers/ResetPassword.js';
import { render as authRenderer } from '@dropins/storefront-auth/render.js';
import { events } from '@dropins/tools/event-bus.js';
import {
  CUSTOMER_ACCOUNT_PATH,
  CUSTOMER_LOGIN_PATH,
  checkIsAuthenticated,
  rootLink,
} from '../../scripts/commerce.js';
import { getPostLoginRedirectUrl } from '../../scripts/auth-gate.js';

// Initialize
import '../../scripts/initializers/auth.js';

function buildAuthSplitLayout(block) {
  const split = document.createElement('div');
  split.className = 'auth-split';

  const brand = document.createElement('div');
  brand.className = 'auth-split__brand';
  brand.innerHTML = `
    <img src="/images/mychep-logo.png" alt="myCHEP - Smart. Simple. Fast." class="auth-split__logo" width="160" height="auto" />
    <p class="auth-split__desc">Reset your password. We'll send you an email with a link to create a new password.</p>
  `;
  split.appendChild(brand);

  const form = document.createElement('div');
  form.className = 'auth-split__form';
  const formInner = document.createElement('div');
  formInner.className = 'auth-split__form-inner';
  form.appendChild(formInner);
  split.appendChild(form);

  block.innerHTML = '';
  block.appendChild(split);
  return formInner;
}

export default async function decorate(block) {
  if (checkIsAuthenticated()) {
    window.location.href = rootLink(CUSTOMER_ACCOUNT_PATH);
    return;
  }

  const formContainer = buildAuthSplitLayout(block);

  await authRenderer.render(ResetPassword, {
    routeSignIn: () => rootLink(CUSTOMER_LOGIN_PATH),
  })(formContainer);

  /* Prevent password show/hide toggle when clicking input — only the eye icon should toggle */
  const fixPasswordToggleClick = () => {
    formContainer.querySelectorAll('.dropin-input-password').forEach((pwdWrapper) => {
      if (pwdWrapper.dataset.toggleClickFixed) return;
      const labelContainer = pwdWrapper.querySelector('.dropin-input-label-container');
      if (labelContainer) {
        pwdWrapper.dataset.toggleClickFixed = 'true';
        labelContainer.addEventListener('click', (e) => e.stopPropagation());
      }
    });
  };
  fixPasswordToggleClick();
  const observer = new MutationObserver(fixPasswordToggleClick);
  observer.observe(formContainer, { childList: true, subtree: true });
  setTimeout(() => { fixPasswordToggleClick(); observer.disconnect(); }, 800);

  events.on('authenticated', (authenticated) => {
    if (authenticated) window.location.href = getPostLoginRedirectUrl();
  });
}
