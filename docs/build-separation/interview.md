# Worktree build identity interview

Status: implemented and locally verified.

## Earlier design

The existing feature/dev-build-identity branch contains an earlier implementation and interview. Its baseline uses the checkout directory as the visible label, inverted development icons, independent saved rules, manual activation of one development installation at a time, and a separate development browser. These earlier decisions remain the starting point.

That implementation selects development identity through an explicit build:dev command. Current main does not contain that implementation and has since added a DevTools panel.

## Confirmed answers, 2026-11-08

1. Initially select automatic worktree detection, then replace it with the explicit `pnpm build:dev` command after discussing how detection would work.
2. Include the worktree label in the DevTools tab name and its page title, matching the other build labels.
3. Include a short, stable identifier with the worktree directory name so worktrees with identical directory names can be distinguished.
4. Both normal and development builds write to `dist/` in the current checkout.
5. Add an instruction to `AGENTS.md` requiring `pnpm build:dev` when working in a worktree.
6. The subsequent `$full-stop` request authorizes implementation, verification, review, and an open PR ready for the user to merge. Leave it unmerged.

## Final design

- `pnpm build:dev` explicitly selects development identity. `pnpm build` keeps normal branding, including nightly and stable packaging. Build selection does not inspect Git or branch names.
- Build the visible label from the checkout directory name plus a short hash of the canonical checkout path. Keep it stable across rebuilds, commits, and branch switches at the same location. Moving or renaming a checkout can change its label and is outside the existing installation-continuity promise.
- Compute one build identity and use it for the manifest name, toolbar title and icons, popup, settings, page titles, and DevTools tab.
- Both variants replace the current checkout's `dist/`. The most recent build determines the identity at that path. The browser uses the identity embedded in the output; it does not need access to Git.
- Keep `AGENTS.md` as the worktree workflow instruction. Preserve independent saved rules, manual development-copy activation, and the existing browser arrangement.
- Rebuild and reload the extension and website tabs after changes. Reopen DevTools for a changed panel label.

The suffix is the first eight hexadecimal characters of a SHA-256 hash of the canonical checkout path. This is an implementation choice. It reduces collisions between equal directory names; it is not a globally unique installation identifier.
