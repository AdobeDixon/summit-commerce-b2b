/**
 * DOM builders for Delivery Locations (B2B address book) — plain DOM, no innerHTML for text.
 */

/**
 * @param {object} site
 * @returns {string[]}
 */
export function getStreetLines(site) {
  if (Array.isArray(site.streetLines) && site.streetLines.length) {
    return site.streetLines.map((s) => String(s).trim()).filter(Boolean);
  }
  return site.address1 ? [String(site.address1)] : [];
}

/**
 * @param {object} site
 * @param {{ shipping: string, billing: string }} labels
 */
export function buildTagRow(site, labels) {
  const row = document.createElement('div');
  row.className = 'bodea-loc-card__tags';
  if (site.defaultShipping) {
    const t = document.createElement('span');
    t.className = 'bodea-loc-card__tag bodea-loc-card__tag--ship';
    t.textContent = labels.shipping;
    row.appendChild(t);
  }
  if (site.defaultBilling) {
    const t = document.createElement('span');
    t.className = 'bodea-loc-card__tag bodea-loc-card__tag--bill';
    t.textContent = labels.billing;
    row.appendChild(t);
  }
  return row;
}

/**
 * Icon-only button with tooltip.
 * @param {'edit'|'delete'|'map'|'star'} kind
 * @param {string} label - aria-label
 * @param {() => void} onClick
 */
export function buildIconButton(kind, label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `bodea-loc-icon-btn bodea-loc-icon-btn--${kind}`;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  let path;
  if (kind === 'edit') {
    path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.75');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z');
  } else if (kind === 'delete') {
    path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.75');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', 'M3 6h18M8 6V4h8v2m-1 0v14H9V6h6z');
  } else if (kind === 'map') {
    path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.75');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', 'M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z');
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', '12');
    c.setAttribute('cy', '10');
    c.setAttribute('r', '2.5');
    c.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    svg.appendChild(c);
    btn.appendChild(svg);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  } else {
    path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.75');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', 'M12 2l3 7h7l-5.5 4 2 7-6.5-4-6.5 4 2-7L2 9h7z');
  }
  svg.appendChild(path);
  btn.appendChild(svg);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

/**
 * Text link button (Set as default, View on map).
 */
export function buildTextAction(text, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bodea-loc-card__link-action';
  btn.textContent = text;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}
