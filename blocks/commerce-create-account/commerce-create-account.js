import { SignUp } from '@dropins/storefront-auth/containers/SignUp.js';
import { render as authRenderer } from '@dropins/storefront-auth/render.js';
import {
  CUSTOMER_LOGIN_PATH,
  checkIsAuthenticated,
  authPrivacyPolicyConsentSlot,
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
    <p class="auth-split__desc">Create your account to access the customer portal. Manage orders, equipment, and delivery locations.</p>
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
    window.location.href = rootLink('/');
    return;
  }

  const formContainer = buildAuthSplitLayout(block);

  await authRenderer.render(SignUp, {
    hideCloseBtnOnEmailConfirmation: true,
    routeSignIn: () => rootLink(CUSTOMER_LOGIN_PATH),
    routeRedirectOnSignIn: () => getPostLoginRedirectUrl(),
    slots: {
      ...authPrivacyPolicyConsentSlot,
    },
  })(formContainer);

  /* Inject input overrides after Dropin — ensure validation icon never overlaps text */
  const style = document.createElement('style');
  style.textContent = `
    body.auth-page .auth-split__form .dropin-input,
    body.auth-page .auth-split__form .dropin-input-container input,
    body.auth-page .auth-split__form input {
      padding-right: 56px !important;
    }
    body.auth-page .auth-split__form .dropin-input-password input {
      padding-right: 56px !important;
    }
  `;
  document.head.appendChild(style);
}
