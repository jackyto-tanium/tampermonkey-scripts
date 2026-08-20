# github-pr-title-md-copier

Tampermonkey userscript for a self-hosted GitHub Enterprise Server
instance. Adds one-click buttons to copy a pull request's title and link
as a Markdown link — `[title](url)` — so you can paste it straight into
Slack, a PR description, or a doc.

## Install

1. Install [Tampermonkey](https://chromewebstore.google.com/detail/fcoeoabgfenejglbffodgkkbkcdhcgfn).
2. On Chrome 120+, go to `chrome://extensions` → Tampermonkey → Details →
   enable **"Allow User Scripts"** (required for Tampermonkey's Manifest V3
   userScripts API to run at all — without it scripts silently no-op).
3. Click this link to open the raw script — Tampermonkey intercepts any
   URL ending in `.user.js` and shows its own install page:
   [github-pr-title-md-copier.user.js](https://raw.githubusercontent.com/jackyto-tanium/tampermonkey-scripts/main/github-pr-title-md-copier/github-pr-title-md-copier.user.js)
   → **Install**.

   <details>
   <summary>Manual install instead (e.g. editing before install)</summary>

   Tampermonkey Dashboard → **+ Create a new script** → select all,
   delete the boilerplate, paste in the full contents of
   `github-pr-title-md-copier.user.js` → save.
   </details>
4. Update the `@include` line to your GitHub Enterprise Server instance's
   domain if it doesn't already fit (default: `https://git.corp.*.com/*`).
5. Reload any page on your GitHub Enterprise Server instance.

## What it adds

| Where | Button | Does |
| --- | --- | --- |
| PR detail page, next to the title | 📋 | Copies that PR's `[title](url)` |
| PR list, next to each row's title | 📋 | Copies that row's `[title](url)` |
| PR list, toolbar above the table | 📄 | Copies a Markdown bullet list of every PR on the current page |
| PR list, toolbar above the table | 📚 | Walks pagination and copies a Markdown bullet list of every PR across all pages |

Hover any button for a tooltip; a brief ✅ (or ⚠️ on error) confirms the
copy.

## Notes

- Uses `GM_setClipboard`, falling back to `navigator.clipboard.writeText`
  if unavailable.
- The site navigates between list/detail pages via Turbo without a full
  page reload, so the script re-injects its buttons on Turbo's lifecycle
  events (with a MutationObserver as a fallback) rather than only on
  initial page load.
- Selectors (`.js-issue-row`, `a.markdown-title`, `h1.gh-header-title`,
  `.paginate-container a.next_page`) match GitHub Enterprise Server's
  current (non-React) PR list/detail markup and may need updating for a
  different GHES version.
