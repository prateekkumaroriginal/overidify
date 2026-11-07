# Build separation

Build identity distinguishes the user's everyday Overidify installation from installations used to test worktree changes.

## Language

**Development build**:
An Overidify build used to test ongoing changes, visibly distinguished from the everyday installation.

**Worktree label**:
The human-readable identity of a worktree build, including its checkout directory name and a short identifier that distinguishes equal directory names.
_Avoid_: Branch label

**Release build**:
An Overidify build intended for ordinary distribution, carrying the standard product identity.

**Independent rules**:
Saved rules belonging to one Overidify installation. Transferring rules to another installation is an explicit user action.
