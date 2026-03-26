# Columns Block

## Overview

The Columns block lays out content in a responsive grid. Supports image columns and variable column counts (2–6 cols).

## DA.live Integration

- Content authored in block rows/cells
- Column count derived from first row's child count

## Configuration

No section metadata. Layout is inferred from structure.

## Behavior

- Adds class `columns-{n}-cols` based on column count
- Image-only columns receive `columns-img-col` for styling

## Accessibility

- Semantic structure; no interactive elements added by block
