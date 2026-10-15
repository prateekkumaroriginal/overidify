# Shared matching

- Rules, Switchers, Network Overrides website eligibility, and the popup must use the same matching logic.

# Documentation

- Documentation and source code must stay in sync at all times. If you find a mismatch, ask the developer which behavior is intended before resolving it.

# Releases

- Main and stable releases evolve independently. Nightly ZIPs track the latest main commit that passes CI; stable ZIPs stay tied to their version tags.
- Keep both nightly and stable ZIP download links in README. Update the stable link when publishing a versioned release.
- For a stable release, align package and manifest versions, the version tag, and the ZIP filename. Preserve published stable tags and ZIPs as main advances.
- Package the verified production build with manifest.json at the ZIP root.
- Keep release notes focused on user-visible changes and essential compatibility notes. Keep installation instructions in README and report validation results separately.
