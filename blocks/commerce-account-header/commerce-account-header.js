import { Header, provider as UI } from '@dropins/tools/components.js';
import { readBlockConfig } from '../../scripts/aem.js';
import { ensureAccountPageShell, isCustomerPortalPath } from './account-layout.js';

export default async function decorate(block) {
  const {
    title = 'My account',
  } = readBlockConfig(block);

  block.innerHTML = '';

  if (isCustomerPortalPath()) {
    await ensureAccountPageShell(title);
  }

  return UI.render(Header, { title })(block);
}
