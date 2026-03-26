# Block-Specific Agent Guidance

This file extends the root `AGENTS.md` for work under `blocks/`. When root and block guidance conflict, prefer this file.

## Scope

- All rules in root `AGENTS.md` apply to blocks in this directory.
- Block folders must include: `<block-name>.js`, `<block-name>.css`, `README.md`, `_<block-name>.json`.
- Use `scripts/utils.js` for `sanitizeUrl()` and `getConfigValue()`.

## Block Inventory

Run `npm run build:json` after adding or changing `_*.json` under blocks.
