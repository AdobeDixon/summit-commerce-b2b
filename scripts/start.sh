#!/usr/bin/env bash
# Resolve EMFILE "too many open files" when running file watchers
ulimit -n 65535 2>/dev/null || true
exec npx aem up
