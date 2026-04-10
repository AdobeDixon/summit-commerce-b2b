/**
 * Stretcher-bond brick wall (masonry), material-colored.
 * Shared by order-new-delivery wizard and bodea-orders-list product previews.
 *
 * @param {string} material clay-facing | clay-engineering | concrete | clay-common | clay-perf | vent
 * @param {{ className?: string }} [opts]
 * @returns {string} SVG markup
 */
export function renderBrickProductIcon(material, opts = {}) {
  const { className } = opts;
  const colors = {
    'clay-facing': '#b45309',
    'clay-engineering': '#1e3a5f',
    concrete: '#6b7280',
    'clay-common': '#78716c',
    'clay-perf': '#9a3412',
    vent: '#57534e',
  };
  const c = colors[material] || colors['clay-common'];
  const m = 'rgb(255 255 255 / 22%)';
  const classAttr = className ? ` class="${className}"` : '';
  return `<svg${classAttr} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="1" y="1" width="30" height="30" rx="2" fill="${c}" opacity="0.12"/>
    <g fill="${c}">
      <rect x="2" y="3" width="13" height="6" rx="0.6"/>
      <rect x="17" y="3" width="13" height="6" rx="0.6"/>
      <rect x="2" y="12" width="8" height="6" rx="0.6"/>
      <rect x="11" y="12" width="10" height="6" rx="0.6"/>
      <rect x="22" y="12" width="8" height="6" rx="0.6"/>
      <rect x="2" y="21" width="13" height="6" rx="0.6"/>
      <rect x="17" y="21" width="13" height="6" rx="0.6"/>
    </g>
    <g stroke="${m}" stroke-width="1">
      <line x1="15.5" y1="3" x2="15.5" y2="9"/>
      <line x1="10" y1="12" x2="10" y2="18"/>
      <line x1="21" y1="12" x2="21" y2="18"/>
      <line x1="15.5" y1="21" x2="15.5" y2="27"/>
      <line x1="2" y1="10.5" x2="30" y2="10.5"/>
      <line x1="2" y1="19.5" x2="30" y2="19.5"/>
    </g>
    ${material === 'vent' ? `<rect x="12" y="13" width="8" height="4" rx="0.4" fill="rgb(255 255 255 / 35%)"/>` : ''}
    ${material === 'clay-perf' ? `<circle cx="8" cy="15" r="1.2" fill="rgb(0 0 0 / 22%)"/><circle cx="16" cy="15" r="1.2" fill="rgb(0 0 0 / 22%)"/><circle cx="24" cy="15" r="1.2" fill="rgb(0 0 0 / 22%)"/>` : ''}
  </svg>`;
}
