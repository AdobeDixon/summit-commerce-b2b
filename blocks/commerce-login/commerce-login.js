import { SignIn } from '@dropins/storefront-auth/containers/SignIn.js';
import { render as authRenderer } from '@dropins/storefront-auth/render.js';
import {
  CUSTOMER_CREATE_PATH,
  CUSTOMER_FORGOTPASSWORD_PATH,
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
    <p class="auth-split__desc">Your logistics control centre. Sign in to manage orders, equipment, and delivery locations.</p>
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

  const params = new URLSearchParams(window.location.search);
  const returnUrl = params.get('returnUrl');
  const appendReturnUrl = (base) => (returnUrl ? `${base}?returnUrl=${encodeURIComponent(returnUrl)}` : base);

  await authRenderer.render(SignIn, {
    renderSignUpLink: false,
    routeForgotPassword: () => appendReturnUrl(rootLink(CUSTOMER_FORGOTPASSWORD_PATH)),
    routeRedirectOnSignIn: () => getPostLoginRedirectUrl(),
    routeSignUp: () => appendReturnUrl(rootLink(CUSTOMER_CREATE_PATH)),
  })(formContainer);

  /* Inject overrides after Dropin (must load last to override SDK) */
  const style = document.createElement('style');
  style.textContent = `
    body.auth-page .auth-split__form .dropin-input,
    body.auth-page .auth-split__form .dropin-input-container input,
    body.auth-page .auth-split__form input {
      padding-right: 56px !important;
    }
    body.auth-page .auth-split__form .dropin-input-password,
    body.auth-page .auth-split__form .auth-sign-in-form__form__password {
      --icon-space: 0 !important;
      margin-left: 0 !important;
      padding-left: 0 !important;
    }
    body.auth-page .auth-split__form .dropin-input-password .dropin-input-container,
    body.auth-page .auth-split__form .dropin-input-password .dropin-input-container * {
      --icon-space: 0 !important;
    }
    body.auth-page .auth-split__form .dropin-input-password input,
    body.auth-page .auth-split__form .dropin-input-password .dropin-input,
    body.auth-page .auth-split__form .dropin-input-password .dropin-input.dropin-input--icon-left {
      padding-left: 16px !important;
      padding-right: 56px !important;
      margin-left: 0 !important;
    }
    body.auth-page .auth-split__form .dropin-input-password .dropin-input__label--floating,
    body.auth-page .auth-split__form .dropin-input-password .dropin-input__label--floating--icon-left {
      padding-left: 16px !important;
    }
  `;
  document.head.appendChild(style);

  /* Add prominent Registration button below Sign in */
  const regBtn = document.createElement('a');
  regBtn.href = appendReturnUrl(rootLink(CUSTOMER_CREATE_PATH));
  regBtn.className = 'auth-registration-btn';
  regBtn.textContent = 'Create account';
  formContainer.appendChild(regBtn);
}
