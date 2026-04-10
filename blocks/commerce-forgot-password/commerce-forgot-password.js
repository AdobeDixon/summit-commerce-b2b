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
    <img src="${rootLink('/images/bodea-inc-logo-white.png')}" alt="Bodea - Smart. Simple. Fast." class="auth-split__logo" width="160" height="auto" />
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

  /* Inject input overrides after Dropin — ensure validation icon never overlaps text */
  const style = document.createElement('style');
  style.textContent = `
    body.auth-page .auth-split__form .dropin-input,
    body.auth-page .auth-split__form .dropin-input-container input,
    body.auth-page .auth-split__form input {
      padding-right: 56px !important;
    }
  `;
  document.head.appendChild(style);

  events.on('authenticated', (authenticated) => {
    if (authenticated) window.location.href = getPostLoginRedirectUrl();
  });
}
