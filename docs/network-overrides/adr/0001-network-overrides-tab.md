# ADR 0001: Add a Network Overrides tab

Status: accepted from the user's request on 2026-10-14.

## Context

Overidify has Rules and Switchers for request header changes. The user requested another tab for a feature named Network Overrides.

## Decision

Present Network Overrides in its own tab. Define its behavior through a design interview before implementation.

## Consequences

The feature needs a separate navigation destination. Its actions, matching behavior, storage, and execution mechanism remain undecided. Rules and Switchers continue to share URL matching logic.
