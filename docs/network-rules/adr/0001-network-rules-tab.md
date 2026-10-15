# ADR 0001: Add a Network Rules tab

Status: accepted from the user's request on 2026-10-14.

## Context

Overidify has Header Rules and Switch Rules for request header changes. The user requested another tab for a feature named Network Rules.

## Decision

Present Network Rules in its own tab. Define its behavior through a design interview before implementation. Feature and tab names are Header Rules, Switch Rules, and Network Rules.

## Consequences

The feature needs a separate navigation destination. Its actions, matching behavior, storage, and execution mechanism remain undecided. Header Rules and Switch Rules continue to share URL matching logic.
