# Accordion Block

## Overview

The Accordion block renders expandable/collapsible sections. Each row has a label (summary) and body content. Uses native `<details>`/`<summary>` for accessibility.

## DA.live Integration

- **Rows**: 1 (container)
- **Columns**: 2 per accordion item (label, body)
- Child block: `accordion-item`

## Configuration

No section metadata. Content is authored in block rows/cells.

## Behavior

- Uses `createElement` and `append`; no `innerHTML` with author content.
- Keyboard accessible via native `<details>` behavior.

## Accessibility

- Semantic `<details>`/`<summary>` elements
- Native expand/collapse without JS
