import { Header, provider as UI } from '@dropins/tools/components.js';
import { readBlockConfig } from '../../scripts/aem.js';
import { isAccountPage, applyAccountLayout } from './account-layout.js';

export default async function decorate(block) {
  const {
    title = 'My account',
  } = readBlockConfig(block);

  block.innerHTML = '';

  if (isAccountPage()) {
    await applyAccountLayout(title);
  }

  return UI.render(Header, { title })(block);
}
