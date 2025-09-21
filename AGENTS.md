# Repository Guidelines

## Project Structure & Module Organization
- `HistoryTabs/manifest.json` declares the MV3 service worker, commands, and broad permissions; update it whenever you add entrypoints or assets.
- Background logic lives in `HistoryTabs/service_worker.js`; content UI is split between `HistoryTabs/cs/content_script.js` and the `HistoryTabs/ui/` HTML, CSS, and JS bundle.
- Shared assets live under `HistoryTabs/icons/`; keep new images at the same resolutions (16/32/48/128) to avoid Chrome warnings.

## Build, Test, and Development Commands
- No bundler is used—edit files in place and reload the unpacked extension from `chrome://extensions` (Developer Mode → Reload) after each change.
- To package a review build, run `cd HistoryTabs && zip -r ../historytabs.zip *` and upload the resulting archive.
- Use Chrome or Edge with the keyboard shortcut `Alt+K` to validate command palette interactions end to end.

## Coding Style & Naming Conventions
- JavaScript follows a lightweight style: 2-space indentation, semicolons, `const`/`let`, camelCase functions, and SCREAMING_SNAKE_CASE for file-level constants; mirror existing quote choices (double quotes for DOM strings, single quotes for UI labels).
- Keep DOM manipulation explicit—prefer vanilla APIs over new dependencies, and colocate helper functions near their single caller.
- CSS in `ui/palette.css` keeps selectors flat and uses hyphen-delimited class names; update shared rules rather than inlining styles.

## Testing Guidelines
- There is no automated test suite; run manual smoke tests on every change: load the unpacked extension, trigger `Alt+K`, navigate history results, toggle pin/unpin, adjust settings, and ensure `chrome.storage.sync` persists values after reload.
- When modifying permissions or storage schema, document migration notes in the PR and manually verify upgrade behavior from an existing profile.

## Commit & Pull Request Guidelines
- Git history favors concise imperative summaries (often Japanese). Keep the first line ≤50 characters, optionally add context in a wrapped body, and reference related issues when relevant.
- For pull requests, include: a short problem statement, the solution outline, manual test notes (browser + scenario), and screenshots or GIFs when UI changes are visible.
- Request review for any permission change or UX alteration and call out potential side effects in the description.

## Security & Permissions Tips
- The extension currently requests `<all_urls>`; audit new features to confirm they truly require this scope and avoid injecting scripts on chrome:// or other restricted pages.
- Store only minimal data in `chrome.storage.sync`, and clear or migrate stale keys when changing schema to avoid exceeding sync quotas.
