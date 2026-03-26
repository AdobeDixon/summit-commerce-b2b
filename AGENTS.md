# Adobe Commerce Storefront Block Rules

Apply these rules to **any new block creation** and to major first-pass rewrites of a block's architecture.
Do not force these rules for unrelated micro-fixes unless explicitly requested.

Typical files:
- `blocks/<block-name>/<block-name>.js`
- `blocks/<block-name>/<block-name>.css`
- `blocks/<block-name>/README.md`
- `blocks/<block-name>/_<block-name>.json`

Use official Adobe Commerce Storefront documentation as source of truth:
- https://experienceleague.adobe.com/developer/commerce/storefront/get-started/

## Scope and File Naming

- `AGENTS.md` is the canonical machine-readable instruction file name for coding agents.
- This file intentionally governs **Commerce block work** first. It is not a generic repo style guide.
- If you want stricter path scoping, keep this root file as a short policy and place block-specific extensions in `blocks/AGENTS.md`.
- If root-level guidance and nested guidance conflict, prefer the more specific path-scoped guidance.

## Normative Language

- **MUST** / **REQUIRED** / **MANDATORY**: non-negotiable.
- **SHOULD** / **RECOMMENDED**: default behavior unless a documented exception exists.
- **MAY** / **OPTIONAL**: situational.

## Rule Priority (highest to lowest)

1. Security and data safety
2. Accessibility and semantic correctness
3. Runtime performance and loading-phase correctness
4. Metadata contract correctness and authoring predictability
5. Maintainability and documentation completeness
6. Visual/style preferences

## Applicability Matrix

| Change type | Apply full file? | Minimum expectation |
|---|---|---|
| New block creation | Yes | Full compliance, README + `_block-name.json`, lint and geometry gates |
| Major first-pass architecture rewrite | Yes | Full compliance for rewritten surfaces, remove stale legacy behavior |
| Micro-fix in existing block | No (unless requested) | Keep fix scoped, preserve existing contracts, avoid opportunistic rewrites |
| Security/accessibility defect | Yes for relevant sections | Enforce mandatory sections even in micro-fixes |

## Fast Path Checklist

Use this short sequence before reading the full detail:
1. Confirm change type from the Applicability Matrix.
2. Validate metadata ownership and naming (`<blockprefix>-<field>`).
3. Implement precedence tiers in code, then mirror exactly in README.
4. Enforce URL and HTML injection safety.
5. Verify Eager/Lazy/Delayed placement and LCP image behavior.
6. Run `npm run lint:js` and `npm run lint:css` (or `npm run lint`).
7. Validate geometry across required widths.
8. Ensure `_block-name.json`, README, and implementation match.

## Required Block Structure

Block JS and CSS are loaded by the EDS pipeline from `blocks/<blockName>/<blockName>.js` and `blocks/<blockName>/<blockName>.css` (see `loadBlock` in `scripts/aem.js`). Auto-blocks (e.g. fragments) are built in `buildAutoBlocks` in `scripts/scripts.js`.

Every new block must include:
- `block-name.js` -- block logic with a single default export `decorate(block)`.
- `block-name.css` -- block styles.
- `README.md` -- documentation (see README Requirements).
- `_block-name.json` -- DA.live configuration (see DA.live JSON Config).

## EDS Loading Phases (Eager-Lazy-Delayed)

Edge Delivery Services loads pages in three sequential phases. Understanding them is
critical for performance.

### Phase E: Eager

- The body starts hidden (`display: none`).
- DOM is decorated: CSS classes for icons, buttons, blocks, and sections are added; auto-blocks are created.
- The **full first section** is loaded. Its first image is the LCP candidate and receives eager loading priority.
- Fewer blocks in the first section = faster LCP.
- Once the LCP candidate and all first-section blocks load, the section is displayed and fonts load asynchronously.

### Phase L: Lazy

- Remaining sections and their blocks (JS + CSS) are loaded.
- Remaining images load via `loading="lazy"`.
- Keep the bulk of lazy-phase payload first-party to maintain control over TBT and FID.
- Most custom blocks run in this phase.

### Phase D: Delayed

- Third-party scripts: analytics, consent management, chat widgets, tag managers.
- Must start **at least 3 seconds after LCP** to avoid impacting the user experience.
- This project loads delayed scripts via `scripts/scripts.js` with a 3s delay (`setTimeout(..., 3000)`). Do not reduce this delay without a documented reason.
- Handled in `delayed.js`; move scripts here if they cause TBT issues.
- Ideally, remove blocking time from scripts entirely and promote them to lazy.

### Implications for block development

- Blocks in the first section must be lightweight (minimal JS, no heavy imports).
- LCP-critical images must use `createOptimizedPicture(url, alt, true, breakpoints)` with `eager=true`.
- Non-LCP images use `lazy` loading.
- Heavy third-party integrations belong in `delayed.js`, not in block code.

## Metadata Contract Rules

### Canonical API first

- Define one canonical metadata API for the block.
- Prefer preset-driven, condensed metadata over many overlapping knobs.
- Do not add legacy aliases unless explicitly required by the task.
- If aliases are required, document them in README and include a deprecation plan.

### Metadata ownership (required)

- Keep authored content in block rows/cells only (copy, links, media).
- Keep behavior/layout controls in section metadata only (alignment, columns, result counts, timing, motion toggles, etc.).
- Do not mix content and behavior in the same authoring surface unless explicitly required.

### Block-specific metadata naming (required)

- Metadata keys must be block-scoped; never use generic keys like `align`, `size`, `density`.
- Use a compact block prefix derived from block name without internal hyphens.
- Preferred author-facing format: `<blockprefix>-<field>`.
  - Example block prefix for `hero-cta`: `herocta`.
  - Example keys: `herocta-align`, `herocta-btnstyle`, `herocta-ctagap`.
- Do not include `data-` in author-facing metadata key names.
- Keep keys concise:
  - one hyphen between prefix and field,
  - no underscores,
  - avoid extra hyphen chains in field names (prefer `contentwidth` over `content-max-width`).
- Keep field tokens semantically clear and stable (`btn`, `cta`, `img` abbreviations are acceptable when consistently applied).

### Metadata precedence contract (required)

Every block must implement and document a deterministic precedence model.

Implementation must resolve metadata in this exact order:

1. **Layout tier**:
   - placement, container width, block size, structural positioning
   - examples: sidebar mode, width mode, align/position, inset, content width
2. **Content/structure tier**:
   - CTA grouping, gaps, type transforms, sizing controls
3. **Style/shape tier**:
   - style preset, corner/shape overrides, border thickness
4. **Color/explicit overrides tier**:
   - border/fill/text colors and other direct visual tokens
5. **Media/motion tier**:
   - frame styles, transitions, image constraints, hover motion

Required behavior:
- Higher tiers establish layout semantics first.
- Lower tiers may refine visuals but must not silently break higher-tier semantics.
- If one setting makes another inapplicable, treat it as a no-op and log a clear block-prefixed warning.
- Avoid hidden coupling. If coupling is intentional, codify it as an explicit rule (for example: full-width disabled when sidebar is enabled).

### Style vs color contract (required)

- Style fields control structure/chrome only (shape, border style, hover motion, layout behavior).
- Color fields control color only (border/fill/text/overlay colors).
- A style option must not silently override explicit color metadata unless documented as an intentional rule.

### DA.live section metadata reads

Author-facing metadata keys use kebab-case (`<blockprefix>-<field>`). In JavaScript, read from `section.dataset` using the camelCase form (e.g. `heroctaAlign`, `dataHeroctaAlign`), as DA.live normalizes keys to camelCase in the DOM.

Section metadata may appear with double-prefix keys. Always read robustly from both:
- `section.dataset.<blockprefixX>`
- `section.dataset.data<blockprefixX>`

Preferred pattern:

```js
function getConfigValue(blockValue, sectionData, keys, fallback) {
  if (blockValue) return blockValue;
  for (let i = 0; i < keys.length; i += 1) {
    if (sectionData?.[keys[i]]) return sectionData[keys[i]];
  }
  return fallback;
}
```

Example key resolution for author key `herocta-align` (in JS use camelCase):
- `section.dataset.heroctaAlign`
- `section.dataset.dataHeroctaAlign`

Do not use inline `||` chaining for config reads; always use a `getConfigValue` helper
so key resolution order is explicit and testable.
- Prefer one shared helper signature across blocks to reduce drift. If a shared utility is unavailable,
  use the same local helper signature shown above.

### Normalize and persist

- Validate every author-facing option and fall back safely.
- Warn on invalid metadata values with block-prefixed warnings.
- Persist resolved values to `block.dataset.*` so CSS reads a stable state.

```js
function normalizeAlign(value, fallback = 'right') {
  const val = (value || '').toLowerCase();
  return ['left', 'center', 'right'].includes(val) ? val : fallback;
}
```

## Drop-in Component Integration

This project uses Adobe Commerce drop-in components for commerce functionality.
Understanding the integration pattern is required for any block that renders commerce UI.

### Initializer lifecycle

Each drop-in has an initializer in `scripts/initializers/`. The common pattern:

```js
import { initializers } from '@dropins/tools/initializer.js';
import { initialize, setEndpoint } from '@dropins/storefront-<dropin>/api.js';
import { initializeDropin } from './index.js';
import { CS_FETCH_GRAPHQL, fetchPlaceholders } from '../commerce.js';

await initializeDropin(async () => {
  setEndpoint(CS_FETCH_GRAPHQL);
  const labels = await fetchPlaceholders('placeholders/<dropin>.json');
  return initializers.mountImmediately(initialize, {
    langDefinitions: { default: { ...labels } },
  });
})();
```

- `initializeDropin` guards against re-initialization.
- `setEndpoint` assigns the GraphQL fetch instance (`CS_FETCH_GRAPHQL` for catalog/search, `CORE_FETCH_GRAPHQL` for cart/auth/account).
- `fetchPlaceholders` loads i18n strings.
- `initializers.mountImmediately` runs the drop-in init.

### Render pattern

Drop-in components use a curried render call:

```js
import { render } from '@dropins/storefront-<dropin>/render.js';
import { SomeContainer } from '@dropins/storefront-<dropin>/containers/SomeContainer.js';

render.render(SomeContainer, {
  // props
  routeProduct: ({ urlKey, sku }) => getProductLink(urlKey, sku),
  onSomeEvent: (data) => { /* handle */ },
  slots: {
    Footer: async (ctx) => {
      const el = document.createElement('div');
      // build slot content with createElement, not innerHTML
      ctx.appendChild(el);
      ctx.onChange((next) => { /* update on prop change */ });
    },
  },
})(containerElement);
```

- `render.render(Component, props)(container)` returns a Promise; mounts the component into the container.
- Use `@dropins/tools/components.js` for shared primitives (`Button`, `Input`, `InLineAlert`).
- Use `h` from `@dropins/tools/preact.js` only when composing icon or primitive props (e.g., `icon: h(Icon, { source: 'Cart' })`).

### Scope isolation

When multiple instances of a drop-in may exist on one page, pass a unique `scope` string
to both the API call and the rendered container to isolate them.

### Dynamic vs static imports

- Use **dynamic imports** (`await import(...)`) when the drop-in is loaded conditionally
  or lazily (e.g., search bar, modal-triggered flows).
- Use **static imports** when the block always needs the drop-in and loads in the lazy phase
  (e.g., product details, cart page).

## Plain JS vs Preact/HTM

Adobe recommends plain JavaScript for blocks to keep bundles small and Lighthouse scores high.

- **Use plain JS** for blocks without complex render state (content blocks, heroes, banners, search bars).
- **Use Preact/HTM** only when the block has complex state management with multiple re-render cycles.
- Drop-in components handle their own rendering internally; you do not need Preact/HTM just because you use a drop-in.
- When using `h` from `@dropins/tools/preact.js`, limit it to composing primitive props (icons, nested components). Do not build entire block UIs with `h()` calls.

## Security Requirements

### URL safety (mandatory)

- Never trust authored `href`/`src` blindly.
- Allow only safe protocols and safe relative forms.
- Explicitly block unsafe protocols (`javascript:`, `data:`, etc.).
- For `target="_blank"`, always enforce `rel="noopener noreferrer"`.

Minimum allowed URL types:
- `http:`
- `https:`
- `mailto:`
- `tel:`
- root-relative (`/path`)
- relative (`./path`, `../path`)
- hash anchors (`#id`)

Use a canonical pattern or helper for validating/sanitizing authored URLs (e.g. try `new URL(url, base)`, check `protocol` against the list above, return `href` or a safe fallback). Optionally centralize this in a shared utility (e.g. `scripts/utils.js`) so blocks do not duplicate logic; if the project prefers block-local helpers, implement the same protocol checks and document the pattern in the block README.

### HTML injection safety

- Do not inject unsanitized author content with `innerHTML`.
- Build DOM with `createElement`/`textContent`.
- Do not log raw `innerHTML` from authored cells in warnings.

## JavaScript Rules

### Architecture

- Single default export: `export default function decorate(block) {}`.
- Keep state local to the block instance; never attach state to `window` or global variables.
- Scope queries to `block` whenever possible (`block.querySelector(...)`, not `document.querySelector(...)`).
- Prefer schema-based config resolution for maintainability.
- Centralize metadata schema in one place (defaults, key map, normalizers, tier/precedence).

```js
// GOOD -- scoped query, single export
export default function decorate(block) {
  const section = block.closest('.section');
  const links = block.querySelectorAll('a');
}

// BAD -- global state, document-wide query
window.myBlockState = {};
document.querySelectorAll('.my-block a');
```

### Loading and lifecycle

- Use explicit loading state (`data-loading`).
- Remove loading state on load/error and with timeout fallback.
- Clean up timers/listeners when re-decorating or disconnecting paths are possible.
- Pause autoplay/timers when page is hidden (`visibilitychange`).
- Prefer one delegated listener on the block over many individual listeners on children.
- If listeners are attached to `document` or `window`, use an `AbortController` signal and abort on disconnect.

```js
block.dataset.loading = 'true';

picture.addEventListener('load', () => {
  delete block.dataset.loading;
});

// Timeout fallback
setTimeout(() => {
  delete block.dataset.loading;
}, 3000);
```

### Error handling and resilience

- If content or config is missing, render a safe fallback (hide section or show placeholder). Do not throw.
- Use `console.warn` with a block-name prefix for invalid metadata or missing content.
- Never fail silently with a bare `return` -- always warn so authors can debug.

```js
// GOOD
if (!imageUrl) {
  console.warn('hero-cta: No valid image in row 1');
  return;
}

// BAD -- silent failure
if (!imageUrl) return;

// BAD -- hard throw
if (!imageUrl) throw new Error('No image');
```

### Images and media

- Use `createOptimizedPicture` from `scripts/aem.js`.
- Use eager loading for likely LCP media; lazy for non-LCP media.
- Provide responsive breakpoints matched to real layout needs.

```js
import { createOptimizedPicture } from '../../scripts/aem.js';

const picture = createOptimizedPicture(
  imageUrl,
  alt,
  isFirstSlide, // true = eager for LCP
  [
    { media: '(min-width: 600px)', width: config.imageMaxWidth },
    { width: '750' },
  ],
);
```

### Performance

- Batch DOM reads then writes; do not interleave reads and writes in loops (layout thrash).
- Avoid scanning the full document; scope to block or section.
- Consider `contain: layout paint` on isolated blocks for rendering performance.
- Use shorthand CSS properties where stylelint expects them.

## HTML and Semantics

- Prefer `<button>` for actions, `<a>` for navigation. Avoid interactive `<div>` when a native element exists.
- Heading hierarchy: one `<h1>` per page; do not skip levels (`h2` then `h4`).
- Use `rel="noopener noreferrer"` with `target="_blank"`. Never use `javascript:` URLs.
- Always set meaningful `alt` on images (empty `alt=""` only for purely decorative images).

```html
<!-- GOOD -->
<button type="button" aria-label="Close">x</button>
<a href="/page" rel="noopener noreferrer" target="_blank">External</a>
<img src="..." alt="Product hero" loading="lazy" />

<!-- BAD -->
<div role="button" onclick="...">x</div>
<a href="javascript:void(0)">Click</a>
<img src="..." alt="image" />
```

## CSS Rules

### Variant model

- Use data attributes for variants, not ad-hoc utility classes.

```css
/* GOOD */
.hero-cta[data-align='center'] .hero-content { text-align: center; }

/* BAD */
.hero-cta.center { text-align: center; }
```

### Maintainability and performance

- Use block-scoped selectors with a block prefix for all classes (e.g., `.hero-cta-content`, `.hero-cta-actions`). Avoid generic names like `.content` or `.button`.
- Keep selector specificity low-to-high (stylelint-friendly ordering).
- Prefer design tokens and custom properties over hardcoded values. Design tokens are defined in `styles/styles.css` (e.g. `--color-*`, `--shape-*`, `--spacing-*`, `--grid-*`); use these instead of hardcoded values.
- Prefer modern color notation (`rgb(0 0 0 / 55%)`).
- Avoid `transition: all`; transition only relevant properties.
- Avoid `!important` unless strictly necessary and documented.
- Use shorthand properties where possible; use 3-value shorthand when the fourth would repeat.

```css
/* GOOD -- design tokens */
.button {
  background-color: var(--color-brand-500);
  border-radius: var(--shape-border-radius-2);
  padding: var(--spacing-3) var(--spacing-4);
}

/* BAD -- hardcoded values */
.button {
  background-color: #007bff;
  border-radius: 8px;
  padding: 12px 16px;
}
```

### Specificity ordering

Keep selectors ordered from low to high specificity:

```css
/* Base */
.hero-content {
  max-width: 420px;
}

/* Data-attribute variant (higher specificity) */
.hero[data-loading] .hero-content {
  opacity: 0.3;
}

/* Compound data-attribute variant (highest specificity) */
.hero[data-align='left'][data-gradient-intensity='light'] .hero-overlay::before {
  background: linear-gradient(90deg, rgb(0 0 0 / 30%) 0%, rgb(0 0 0 / 0%) 60%);
}
```

### Focus visible

Always style `:focus-visible` for keyboard users. Never remove focus outlines without a visible replacement.

```css
/* GOOD */
.hero-cta-actions .button:focus-visible {
  outline: 2px solid var(--color-brand-500);
  outline-offset: 2px;
}

/* BAD */
.button:focus {
  outline: none;
}
```

### Floating/overlay safety (required)

- For absolute/floating UI layers (whiteboxes, overlays, floating CTAs), clamp to parent bounds.
- Required guardrails:
  - `box-sizing: border-box`
  - `max-width: 100%`
  - parent-aware width clamps for narrow breakpoints
- Floating elements must not create horizontal overflow or overlap neighboring cards at supported breakpoints.

## Accessibility

- Keyboard accessible interactions only.
- Use semantic elements (`a` for navigation, `button` for actions).
- Visible `:focus-visible` states are required.
- Respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  .hero-slide {
    transition: none;
  }
}
```

- Maintain AA contrast for critical text/CTA states.
- Minimum tap target: `44x44`.

## README Requirements

Each block README must include:
1. Overview
2. DA.live integration and authoring structure
3. Configuration options
4. Behavior patterns
5. Accessibility notes
6. Troubleshooting

### README tables are required

Include both:
- **DA.live Model Options**
- **Section Metadata Reference**

Section Metadata Reference must use a **3-column table**:
- key/field (the author-facing key, e.g. `herocta-align`)
- possible values
- effect (plain-language, outcome-focused, extensive)

Default behavior must still be documented, but include it inside the effect text
(for example: `Default: medium. Controls ...`), rather than as a separate column.

Also include:
- Section Metadata placement guidance (immediately above block).
- Supported aliases (only if intentionally implemented).

Section Metadata Reference should be grouped by functional area where relevant:
- Layout
- CTA/Button
- Frame/Image
- Motion
- Behavior

### README must mirror precedence contract

For block creation and first-pass docs, README must include a **Metadata Precedence** section using the same tier order implemented in code. When the block has multiple metadata options, mutually exclusive choices, or a non-trivial precedence order, also include:
- A concise **Override Rules** table (condition, winner, ignored/no-op fields, user-visible effect).
- A **Conflict/No-op Notes** section for common invalid or non-effective combinations.
- A **Conflict Matrix** for mutually exclusive options (condition, winner, ignored/no-op, effect).
- Keep tier names and order identical to the **Metadata precedence contract** section above; do not rename tiers in README.

For very simple blocks (one or two metadata keys, no real precedence), a short note that precedence is N/A or a single sentence may suffice.

## DA.live JSON Config

The `_block-name.json` file configures how DA.live presents the block to authors.
It contains three arrays: `definitions`, `models`, and `filters`.

### Definitions

Maps the block to DA.live's content structure:

```json
{
  "definitions": [
    {
      "title": "Block Title",
      "id": "block-id",
      "plugins": {
        "da": {
          "name": "block-id",
          "rows": 1,
          "columns": 1,
          "behaviour": "columns"
        }
      }
    }
  ]
}
```

- `rows` and `columns` must match the actual authoring table structure the block expects.
- `behaviour` controls how DA.live arranges cells (`"columns"` is most common).

### Models

Defines the editing fields shown in the DA.live sidebar:

```json
{
  "models": [
    {
      "id": "block-id",
      "fields": [
        {
          "component": "text",
          "valueType": "string",
          "name": "placeholder",
          "value": "Default value",
          "label": "Placeholder Text",
          "description": "Hint for authors",
          "required": false
        },
        {
          "component": "select",
          "valueType": "string",
          "name": "alignment",
          "value": "center",
          "label": "Alignment",
          "options": [
            { "name": "Left", "value": "left" },
            { "name": "Center", "value": "center" },
            { "name": "Right", "value": "right" }
          ]
        },
        {
          "component": "number",
          "valueType": "number",
          "name": "resultCount",
          "value": 8,
          "label": "Results Count",
          "validation": { "numberMin": 2, "numberMax": 20 }
        }
      ]
    }
  ]
}
```

Common `component` types: `text`, `select`, `number`, `richtext`, `boolean`.

### Filters

Controls which child components are allowed inside the block:

```json
{
  "filters": [
    { "id": "block-id", "components": [] }
  ]
}
```

An empty `components` array means no child components are filtered.

### Integration with project-level configs

- `component-models.json` aggregates all block models by id.
- `component-filters.json` aggregates all block filters.
- `component-definition.json` aggregates all block definitions.
- Keep `_block-name.json` aligned with actual authoring shape; avoid stale model fields that no longer map to behavior.

### Registering a new block

Definitions are sourced from `models/_component-definition.json`, which references block folders via globs (e.g. `../blocks/hero/_*.json#/definitions`, `../blocks/product-*/_*.json#/definitions`). For a new block to appear in the DA.live authoring UI, either add an entry in the appropriate group in `models/_component-definition.json` pointing to `../blocks/<block-name>/_*.json#/definitions`, or place the block in a folder that already matches an existing glob (e.g. `product-*`). After changing any `_*.json` under `blocks/` or any file under `models/`, run `npm run build:json` so `component-definition.json`, `component-models.json`, and `component-filters.json` are updated (the pre-commit hook stages these built files).

## Removal and Breaking Changes

### Block/capability removal protocol (required)

When removing a custom block or capability, remove all implementation surfaces:
- block folder/files under `blocks/<block-name>`
- model/filter registrations (`component-models.json`, `component-filters.json`)
- metadata readers/normalizers and dead CSS selectors
- README references for removed behavior

### Breaking-change policy

- If backward compatibility is not requested, remove legacy keys/aliases entirely.
- If backward compatibility is requested, explicitly document:
  - legacy keys retained
  - canonical replacement
  - sunset/removal plan

## Exceptions Process (required)

- If a required rule cannot be followed, document a short exception note in the PR/commit:
  - rule being waived
  - reason
  - risk
  - mitigation and follow-up owner
- Exceptions must be explicit. Silent deviations are not allowed.

## Responsive Geometry Gate

- Validate layout geometry across representative widths before shipping.
- Minimum sweep: `360, 390, 414, 480, 768, 1024, 1280, 1440, 1920` (or the project's defined viewport list if one exists).
- Treat hard geometry leak > `2px` as a defect (card/panel/button overflow or clipping).
- Separate true geometry failures from visual-only effects (e.g., box-shadow overflow).
- If no automated viewport test exists for a block, record the manual sweep widths and outcomes in PR notes.

## Linting and Quality Gates

All block creation changes must pass:
- ESLint (JS)
- Stylelint (CSS)

Typical commands:

```bash
npm run lint
npm run lint:js
npm run lint:css
```

Follow project conventions:
- Respect project ESLint and Stylelint rules (including line length, e.g. 100 characters).
- Use single quotes in JS.
- Add trailing commas.
- Remove trailing spaces.
- Use `// eslint-disable-next-line` for necessary exceptions (e.g., bitwise operators).

## Before Shipping Checklist

1. Lint passes (`lint:js` and `lint:css`).
2. Metadata resolution works for both single and double-prefix section keys.
3. Precedence tiers are implemented in code and documented in README with matching terminology.
4. Override/no-op combinations are deterministic and warned clearly.
5. Invalid metadata safely falls back and logs actionable warnings.
6. Unsafe URLs are blocked; `_blank` links include `noopener noreferrer`.
7. No-JS fallback: critical content and links are visible/usable before decoration.
8. Motion respects `prefers-reduced-motion` and timers are lifecycle-safe.
9. Mobile and desktop layouts are verified, including `44x44` tap targets.
10. README and `_block-name.json` match implemented behavior.
11. Responsive geometry gate passes across required widths (no hard leak > `2px`).
12. Floating/absolute UI layers are clamped and do not overflow/clip at small screens.
13. Drop-in components (if used) are scoped, initialized correctly, and handle render errors gracefully.
14. Block works correctly in both Eager and Lazy loading phases as appropriate.
15. If the change affects critical user paths, run or extend project tests (e.g. Cypress) where applicable.
