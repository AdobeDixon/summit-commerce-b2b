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
    <img src="/images/mychep-logo.png" alt="myCHEP - Smart. Simple. Fast." class="auth-split__logo" width="160" height="auto" />
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

  /* Fix password field: move eye icon into input container so it anchors inside the field */
  const fixPasswordField = () => {
    formContainer.querySelectorAll('.dropin-input-password').forEach((pwdWrapper) => {
      const labelContainer = pwdWrapper.querySelector('.dropin-input-label-container');
      const inputContainer = pwdWrapper.querySelector('.dropin-input-container');
      const eyeIcon = pwdWrapper.querySelector('.dropin-input-password__eye-icon');
      if (labelContainer && !pwdWrapper.dataset.labelClickFixed) {
        labelContainer.addEventListener('click', (e) => e.stopPropagation());
        pwdWrapper.dataset.labelClickFixed = 'true';
      }
      /* Move eye into container so it positions relative to the input, not the full form */
      if (inputContainer && eyeIcon && !inputContainer.contains(eyeIcon)) {
        inputContainer.appendChild(eyeIcon);
      }
    });
  };
  fixPasswordField();
  const observer = new MutationObserver(fixPasswordField);
  observer.observe(formContainer, { childList: true, subtree: true });
  [50, 200, 500, 1000, 2000].forEach((ms) => setTimeout(fixPasswordField, ms));
  setTimeout(() => observer.disconnect(), 2500);
}
