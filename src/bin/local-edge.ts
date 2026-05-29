#!/usr/bin/env tsx
/**
 * @fileoverview tsx-backed executable entry for the agnostic local-edge package-core CLI.
 *
 * This file owns argv delegation into `LocalEdgeCore_runCli` plus `process.exit` wiring; `bin/local-edge.js` launches this file via tsx so the published npm bin reaches the TypeScript entry without a precompile step.
 * Flow: argv slice -> parse and render CLI output -> exit 0 on success or 1 on thrown parse errors.
 *
 * @testing CLI: npm run test --prefix packages/local-edge-core
 * @testing CLI: from the repo root run npx tsx packages/local-edge-core/src/bin/local-edge.ts --help and verify printed usage lines plus exit code 0.
 *
 * @see packages/local-edge-core/src/cli.ts - Owns LocalEdgeCore_runCli and dry-run help rendering that consumes argv forwarded from this tsx executable.
 * @see packages/local-edge-core/bin/local-edge.js - Node bin shim that spawns tsx on this entry so named bin local-edge resolves here after install.
 * @see docs/TYPESCRIPT_STANDARDS_DOCUMENTATION_FILE_OVERVIEWS.md - Repository standard defining audited @fileoverview tag order and metadata for this header.
 *
 * @documentation reviewed=2026-05-22 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
import { LocalEdgeCore_runCli } from "../cli.js";

process.exit(LocalEdgeCore_runCli(process.argv.slice(2)));
