# Clerk docs dark theme reference

Checked 2026-10-08. Reference is the documentation website at [clerk.com/docs](https://clerk.com/docs), including the [Next.js quickstart](https://clerk.com/docs/nextjs/getting-started/quickstart). Values below come from the pages' HTML classes and their [official stylesheet](https://clerk.com/_next/static/immutable/chunks/2atoh-lkvob5k.css), fetched directly. They are source observations, not screenshot estimates. This does not use Clerk's authentication component dark preset.

## Observed colors

| Role | Value | Source evidence |
| --- | --- | --- |
| Documentation canvas, sidebar, header | `#131316` | `dark:bg-gray-950` |
| Outer page gutter | `#000000` | Docs inline `:root.dark { --root-bg: #000 }` |
| Raised cards, search field, inline code | `#212126` | `dark:bg-gray-900`, `--typography-code-bg` |
| Stronger fill, code block body, hover | `#2f3037` | `gray-800`, quickstart `--code-bg` |
| Active navigation fill | `#27272d` | Sidebar `--active-bg: var(--color-gray-850)` |
| Headings and active text | `#ffffff` | `dark:text-white`, `--typography-heading` |
| Links and strong text | `#d9d9de` | `gray-200`, `--typography-link`, `--typography-strong` |
| Secondary copy | `#9394a1` | `gray-400`, `--typography-color` |
| Muted icons | `#747686` | `dark:text-gray-500` |
| Sidebar and header separators | `#212126` | `dark:border-gray-900` |
| Card border and input outline | `rgba(255,255,255,0.1)` | Card/input dark shadow outline |
| Card top highlight | `rgba(255,255,255,0.06)` | Card inset top shadow |
| Inner hover border | `rgba(255,255,255,0.05)` | `dark:border-white/5` |
| Purple action accent | `#6c47ff` | Quickstart `bg-purple-500` button |
| Dark callout accent | `#846bff` | Quickstart dark `ceramic-purple-600` |
| Code keyword/function purple | `#bab1ff` | Dark Shiki token `purple-300` |

The role assignments come from [docs page HTML](https://clerk.com/docs) and [quickstart HTML](https://clerk.com/docs/nextjs/getting-started/quickstart); hex definitions and dark typography variables come from the [stylesheet](https://clerk.com/_next/static/immutable/chunks/2atoh-lkvob5k.css).

## Styling details

The docs homepage's primary navigation buttons use white fills and `#131316` text in dark mode. Its card headings are white while descriptions use `#9394a1`. Selected sidebar entries use `#27272d` with white text; their hover fill mixes 65% `#27272d` with 35% `#131316`. Cards use an 8px radius and inputs an 8px radius. [Source: docs HTML](https://clerk.com/docs).

The CSS font stack uses Suisse with Geist for numbers, and Soehne Mono for code. Small copy tokens are 13px; base copy is 15px. These font families are reference observations, not a recommendation to redistribute Clerk's font assets. [Source: stylesheet](https://clerk.com/_next/static/immutable/chunks/2atoh-lkvob5k.css).

## Applying the reference to Overidify

Use `#131316` for the extension canvas, `#212126` for fields and cards, white for headings, and `#9394a1` for secondary copy. Keep borders subtle and reserve purple for deliberate actions. This mapping is a proposed adaptation for the extension, not a Clerk-provided theme contract.

The navigation hover mix is approximately `#202025` after channel rounding. That value is calculated from the observed CSS mix; Clerk does not declare it as a hex token. Other values in the table are exact declarations. Runtime rendering and responsive layout were not measured in a browser during this research.
