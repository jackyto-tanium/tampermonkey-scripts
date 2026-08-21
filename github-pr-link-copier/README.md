# github-pr-link-copier

Tampermonkey userscript for a self-hosted GitHub Enterprise Server
instance. Adds buttons to copy a pull request's title and link — as
Markdown (`[title](url)`) or as a real clickable rich-text link — so you
can paste it straight into Slack, a PR description, an email, or a doc.

## Install

1. Install [Tampermonkey](https://chromewebstore.google.com/detail/fcoeoabgfenejglbffodgkkbkcdhcgfn).
2. On Chrome 120+, go to `chrome://extensions` → Tampermonkey → Details →
   enable **"Allow User Scripts"** (required for Tampermonkey's Manifest V3
   userScripts API to run at all — without it scripts silently no-op).
3. Click this link to open the raw script — Tampermonkey intercepts any
   URL ending in `.user.js` and shows its own install page:
   [github-pr-link-copier.user.js](https://raw.githubusercontent.com/jackyto-tanium/tampermonkey-scripts/main/github-pr-link-copier/github-pr-link-copier.user.js)
   → **Install**.

   <details>
   <summary>Manual install instead (e.g. editing before install)</summary>

   Tampermonkey Dashboard → **+ Create a new script** → select all,
   delete the boilerplate, paste in the full contents of
   `github-pr-link-copier.user.js` → save.
   </details>
4. Update the `@include` line to your GitHub Enterprise Server instance's
   domain if it doesn't already fit (default: `https://git.corp.*.com/*`).
5. Reload any page on your GitHub Enterprise Server instance.

## What it adds

| Where | Button | Does |
| --- | --- | --- |
| PR detail page, next to the title | 📋 | Copies that PR's title + link |
| PR list, next to each row's title | 📋 | Copies that row's title + link |
| PR list, toolbar above the table | 📄 | Copies every PR on the current page |
| PR list, toolbar above the table | 📚 | Walks pagination and copies every PR across all pages |
| PR list, toolbar above the table | ☑️ | Copies whichever rows' checkboxes are currently checked (leaves them checked, so you can copy the same selection again in another format/style) |

The list also gets a checkbox next to each row (GHE's own native
bulk-select checkbox, kept forced visible — see Notes) so you can check
just the ones you want before clicking ☑️.

Every copy button supports two formats:
- **Markdown** copies `[title](url)`, or a list of those for the
  multi-item buttons.
- **Rich Text** copies a real clickable HTML link, or an HTML list of
  links, that pastes as an actual link in Slack, Gmail, Docs, Notion,
  etc., with the Markdown text as a plain-text fallback for targets that
  don't accept rich paste.

The three multi-item buttons (📄/📚/☑️) additionally support three list
styles: **Bullet** (`- [title](url)`), **Numbered** (`1. [title](url)`),
or **Plain Lines** (no marker).

**A single click copies immediately using your defaults** (Markdown +
Bullet, unless you've changed them — see Settings below).

**Click-and-hold** for about half a second instead pops up a menu to pick
Markdown or Rich Text for just that one copy (your defaults are
unchanged). On the single-item buttons, clicking either one copies right
away.

On the three multi-item buttons, the same click-vs-hold split applies one
level deeper: **clicking** "Markdown" or "Rich Text" in that menu copies
immediately using your default list style. **Holding** on "Markdown" or
"Rich Text" instead pops up a second menu, at the same spot, to also pick
Bullet, Numbered, or Plain Lines for that one copy.

Hover any button for a tooltip; a brief ✅ (or ⚠️ on error) confirms the
copy.

## Settings

There's no in-page settings UI. To change either default: click the
**Tampermonkey icon** in Chrome's toolbar while on a matching page → under
this script's name, pick from "Default copy format: Markdown / Rich
Text" and "Default list style: Bullet / Numbered / Plain Lines". The
menu labels only reflect which one is current after a page reload — the
setting itself takes effect immediately either way.

## Notes

- Markdown copies use `GM_setClipboard`, falling back to
  `navigator.clipboard.writeText` if unavailable. Rich Text copies use
  `navigator.clipboard.write` with a `ClipboardItem` carrying both
  `text/html` and a plain-text fallback, falling back to the Markdown
  path if the Clipboard API is unavailable.
- Both defaults are stored via `GM_setValue`/`GM_getValue` and exposed
  through `GM_registerMenuCommand` (see Settings above) — none of it
  touches the page itself.
- Checkbox selection reuses the PR list's own native per-row bulk-select
  checkboxes rather than injecting new ones. GHE hides that column below
  a ~768px window width via `.d-none { display: none !important; }`;
  the script forces it visible with the same `!important` priority so it
  can't lose that fight regardless of window width. Selection is scoped
  to whatever page you're currently on — it doesn't persist across
  pagination.
- The site navigates between list/detail pages via Turbo without a full
  page reload, so the script re-injects its buttons on Turbo's lifecycle
  events (with a MutationObserver as a fallback) rather than only on
  initial page load.
- Selectors (`.js-issue-row`, `a.markdown-title`, `h1.gh-header-title`,
  `.paginate-container a.next_page`, `input.js-issues-list-check`) match
  GitHub Enterprise Server's current (non-React) PR list/detail markup
  and may need updating for a different GHES version.
