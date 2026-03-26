/**
 * Shared utilities for blocks. See AGENTS.md for usage patterns.
 */

const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];
const UNSAFE_PROTOCOLS = ['javascript:', 'data:', 'vbscript:'];

/**
 * Validates and sanitizes an authored URL. Blocks MUST use this for any href/src
 * that may come from author content. See AGENTS.md Security Requirements.
 *
 * @param {string} url - The URL to validate
 * @param {string} [base] - Base URL for resolving relative URLs
 * @returns {string} The sanitized URL or empty string if unsafe
 */
export function sanitizeUrl(url, base = window.location.href) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  try {
    const resolved = new URL(trimmed, base);
    const { protocol } = resolved;

    if (UNSAFE_PROTOCOLS.includes(protocol)) return '';
    if (SAFE_PROTOCOLS.includes(protocol)) return resolved.href;
    // Relative paths resolve to base protocol (http/https)
    if (protocol === 'http:' || protocol === 'https:') return resolved.href;
    return '';
  } catch {
    return '';
  }
}

/**
 * Resolves config from block value, section metadata (single and double-prefix),
 * then fallback. Use for block-scoped metadata per AGENTS.md.
 *
 * @param {*} blockValue - Value from block config/cells
 * @param {DOMStringMap} sectionData - section.dataset
 * @param {string[]} keys - camelCase keys to try (e.g. ['heroctaAlign', 'dataHeroctaAlign'])
 * @param {*} fallback - Default when nothing matches
 * @returns {*} Resolved value
 */
export function getConfigValue(blockValue, sectionData, keys, fallback) {
  if (blockValue !== undefined && blockValue !== null && blockValue !== '') return blockValue;
  for (let i = 0; i < keys.length; i += 1) {
    if (sectionData?.[keys[i]]) return sectionData[keys[i]];
  }
  return fallback;
}
