# Executions validation

Implementation checks completed on 2026-11-04.

## Results

- All 132 unit tests passed.
- All 50 browser regression tests passed on the current cached Chromium.
- All three execution browser scenarios passed on Chrome for Testing 119.0.6045.105.
- Application and browser-test TypeScript checks, lint, and the production build passed.
- Standards and spec reviews completed. Fixes cover document-start recording, stale recording configuration, configured bodies on failed executions, delivered header normalization, metadata-budget rejection, and direct source attribution in DNR compilation.

A one-time smoke check opened the native Overidify DevTools panel and recorded a real Network execution in its Executions table.

UI validation completed on 2026-11-08. The production build, lint, and all 140 unit tests passed. One-time checks exercised the list and inspector at five viewport sizes, independent scrolling, stable row heights, restored focus and scroll positions after closing the inspector, automatic scrollbar gutters, and the absence of native title attributes. Title and result text baselines were also checked at 400, 700, and 1200 pixels wide. Temporary UI verification files were removed after reporting results.

Before filing the PR, the branch was merged with the latest main. The production build, lint, application/browser-test TypeScript checks, all 142 unit tests, and all three execution browser regression tests passed on cached Chromium.

## Regression boundaries

The user requested coverage across all feature areas. Retained regression tests exercise public application interfaces below the UI: execution history and controls, DNR installation/reporting, and the Network interceptor through the extension message boundary. Routine UI checks are separate from the retained regression suite under `AGENTS.md`.

Checks passed for immutable rule/response snapshots, Pause/Resume without backfill, Clear rejecting delayed executions, shared-budget eviction and oversized bodies, oversized metadata rejection, equal-timestamp Chrome occurrences across overlapping polls/navigation, separate before/sent header observations, and snapshot-storage pressure during installation. A delayed configuration response cannot overwrite a newer recording token.

Browser checks passed for a real Network mock and observed call-server failure, configured bodies on failed executions, normalized delivered headers, recording at document start after navigation, Header/Switch browser confirmation, selected Switch option snapshots, and separately identified request observations. The fixture selects modern headless mode explicitly, since Chrome 119's legacy headless mode cannot load the extension.

Recording must work on ordinary insecure HTTP websites. A regression scenario removes the secure-context-only `crypto.randomUUID` API before executing a recorded Network mock. Capture uses a local identifier sequence and does not require that API.

## Limits

An actual Store-installed build and Store review remain unverified. The prior [packed sideload experiment](../research/execution-logging.md#packed-runtime-validation-2026-11-04) verified the required production API gate on Linux Chrome 154, not Store approval. Match history remains delayed and lacks request identity and per-rule failure outcomes. The UI presents those limits explicitly.

One-time verification artifacts belong under `.scratch/verification/executions/` and are removed after reporting results. No routine UI/layout test is retained in the normal suite.
