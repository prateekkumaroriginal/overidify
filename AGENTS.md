# Shared matching

- Header Rules, Switch Rules, Network Rules website eligibility, and the popup must use the same matching logic.

# Testing

- Keep automated regression tests for meaningful application decisions, transformations, state changes, side effects, and failure handling. Test through public application interfaces below the UI.
- Trust documented framework, library, and browser contracts. Exclude tests that merely reconfirm those guarantees, such as a standard Link following its href or a native disabled control blocking interaction.
- Verify routine UI wiring, navigation, rendering, and layout during implementation and when relevant changes affect them. Report these checks with the change; keep them out of the retained regression suite.
- Put one-time verification scripts, screenshots, and logs in the gitignored `.scratch/verification/<task>/` directory. Run them explicitly outside normal test commands and CI. Report the results, then remove that task's temporary files.
- Cover each behavior at the appropriate application boundary without duplicating the same cases across test layers. Keep trivial code inline instead of extracting it solely for testing.

# Releases

- Main and stable releases evolve independently. Nightly ZIPs track the latest main commit that passes CI; stable ZIPs stay tied to their version tags.
- Keep both nightly and stable ZIP download links in README. Update the stable link when publishing a versioned release.
- For a stable release, align package and manifest versions, the version tag, and the ZIP filename. Preserve published stable tags and ZIPs as main advances.
- Package the verified production build with manifest.json at the ZIP root.
- Keep release notes focused on user-visible changes and essential compatibility notes. Keep installation instructions in README and report validation results separately.
