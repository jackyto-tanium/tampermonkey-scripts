// ==UserScript==
// @name         GitHub PR Link Copier
// @namespace    github-pr-link-copier
// @version      2.0
// @author       Jacky To
// @description  Copy PR title+link (Markdown or Rich Text) from a PR page or the PR list table
// @include      https://git.corp.*.com/*
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  function toMdLink(title, url) {
    return `[${title.replace(/[[\]]/g, '\\$&')}](${url})`;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function toHtmlLink(title, url) {
    return `<a href="${url}">${escapeHtml(title)}</a>`;
  }

  function toMdListStyled(items, style) {
    if (style === 'numbered') return items.map((i, idx) => `${idx + 1}. ${toMdLink(i.title, i.url)}`).join('\n');
    if (style === 'plain') return items.map((i) => toMdLink(i.title, i.url)).join('\n');
    return items.map((i) => `- ${toMdLink(i.title, i.url)}`).join('\n');
  }

  function toHtmlListStyled(items, style) {
    if (style === 'numbered') return `<ol>${items.map((i) => `<li>${toHtmlLink(i.title, i.url)}</li>`).join('')}</ol>`;
    if (style === 'plain') return items.map((i) => `<div>${toHtmlLink(i.title, i.url)}</div>`).join('');
    return `<ul>${items.map((i) => `<li>${toHtmlLink(i.title, i.url)}</li>`).join('')}</ul>`;
  }

  function copyText(text) {
    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(text, 'text');
    } else {
      navigator.clipboard.writeText(text).catch((e) => console.error('[PR MD Copier] clipboard write failed', e));
    }
  }

  // Writes real HTML (renders as a clickable link/list when pasted into a
  // rich text target) with a markdown-text fallback for plain-text targets.
  function copyRich(html, plainFallback) {
    if (navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof ClipboardItem !== 'undefined') {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plainFallback], { type: 'text/plain' }),
      });
      navigator.clipboard.write([item]).catch((e) => {
        console.error('[PR MD Copier] rich clipboard write failed, falling back to plain text', e);
        copyText(plainFallback);
      });
    } else {
      copyText(plainFallback);
    }
  }

  function copyInFormat(format, plainText, htmlText) {
    if (format === 'rich') {
      copyRich(htmlText, plainText);
    } else {
      copyText(plainText);
    }
  }

  // Default format for a single click. No in-page settings UI — change it
  // via the Tampermonkey extension icon's own menu (see commands below).
  const DEFAULT_FORMAT_KEY = 'defaultFormat';
  const VALID_FORMATS = ['markdown', 'rich'];

  if (typeof GM_getValue === 'function' && typeof GM_setValue === 'function' && GM_getValue(DEFAULT_FORMAT_KEY) === undefined) {
    GM_setValue(DEFAULT_FORMAT_KEY, 'markdown');
  }

  function getDefaultFormat() {
    const val = typeof GM_getValue === 'function' ? GM_getValue(DEFAULT_FORMAT_KEY, 'markdown') : 'markdown';
    return VALID_FORMATS.includes(val) ? val : 'markdown';
  }

  // Default list style for a single click on the multi-item buttons
  // (this page / all pages / selected). Meaningless for the single-item
  // detail/per-row buttons, which ignore it.
  const DEFAULT_STYLE_KEY = 'defaultListStyle';
  const VALID_STYLES = ['bullet', 'numbered', 'plain'];

  if (typeof GM_getValue === 'function' && typeof GM_setValue === 'function' && GM_getValue(DEFAULT_STYLE_KEY) === undefined) {
    GM_setValue(DEFAULT_STYLE_KEY, 'bullet');
  }

  function getDefaultListStyle() {
    const val = typeof GM_getValue === 'function' ? GM_getValue(DEFAULT_STYLE_KEY, 'bullet') : 'bullet';
    return VALID_STYLES.includes(val) ? val : 'bullet';
  }

  // Click the Tampermonkey icon in the browser toolbar (while on a
  // matching page) to see these and switch the defaults.
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand(`Default copy format: Markdown${getDefaultFormat() === 'markdown' ? ' (current)' : ''}`, () => {
      GM_setValue(DEFAULT_FORMAT_KEY, 'markdown');
    });
    GM_registerMenuCommand(`Default copy format: Rich Text${getDefaultFormat() === 'rich' ? ' (current)' : ''}`, () => {
      GM_setValue(DEFAULT_FORMAT_KEY, 'rich');
    });
    GM_registerMenuCommand(`Default list style: Bullet${getDefaultListStyle() === 'bullet' ? ' (current)' : ''}`, () => {
      GM_setValue(DEFAULT_STYLE_KEY, 'bullet');
    });
    GM_registerMenuCommand(`Default list style: Numbered${getDefaultListStyle() === 'numbered' ? ' (current)' : ''}`, () => {
      GM_setValue(DEFAULT_STYLE_KEY, 'numbered');
    });
    GM_registerMenuCommand(`Default list style: Plain Lines${getDefaultListStyle() === 'plain' ? ' (current)' : ''}`, () => {
      GM_setValue(DEFAULT_STYLE_KEY, 'plain');
    });
  }

  function flash(btn, label) {
    const original = btn.textContent;
    btn.textContent = label;
    setTimeout(() => { btn.textContent = original; }, 1200);
  }

  // Small popup letting the user pick from a list of {label, value}
  // items — used for the format choice, and (click-through, as a second
  // popup at the same spot) for the list-style choice. Only one instance
  // is open at a time.
  const FORMAT_OPTIONS = [
    { label: 'Markdown', value: 'markdown' },
    { label: 'Rich Text', value: 'rich' },
  ];
  const STYLE_OPTIONS = [
    { label: 'Bullet List', value: 'bullet' },
    { label: 'Numbered List', value: 'numbered' },
    { label: 'Plain Lines', value: 'plain' },
  ];

  let closeActiveMenu = null;

  function showMenu(anchor, items, onChoose) {
    if (closeActiveMenu) closeActiveMenu();

    const menu = document.createElement('div');
    menu.className = 'pr-md-copier-menu';
    Object.assign(menu.style, {
      position: 'absolute',
      zIndex: '100',
      background: '#fff',
      color: '#1f2328',
      border: '1px solid #d0d7de',
      borderRadius: '6px',
      boxShadow: '0 8px 24px rgba(140,149,159,0.3)',
      padding: '4px',
      display: 'flex',
      flexDirection: 'column',
      minWidth: '140px',
    });

    // `onHold`, if given, makes this one item support the same
    // click-vs-hold split as the top-level button: a quick click commits
    // `value` immediately, while holding past HOLD_MS opens a further
    // (sub-)menu instead of committing anything here.
    function makeItem({ label, value, onHold }) {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = label;
      Object.assign(item.style, {
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '6px 8px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        font: 'inherit',
        color: 'inherit',
        borderRadius: '4px',
      });
      item.addEventListener('mouseenter', () => { item.style.background = '#f6f8fa'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });

      let itemHoldTimer = null;
      let itemLongPressFired = false;

      if (onHold) {
        item.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          itemLongPressFired = false;
          itemHoldTimer = setTimeout(() => {
            itemLongPressFired = true;
            close();
            onHold();
          }, HOLD_MS);
        });
        ['mouseup', 'mouseleave'].forEach((evt) => item.addEventListener(evt, () => clearTimeout(itemHoldTimer)));
      }

      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (itemLongPressFired) {
          itemLongPressFired = false;
          return;
        }
        close();
        onChoose(value);
      });
      return item;
    }

    items.forEach((it) => menu.appendChild(makeItem(it)));
    document.body.appendChild(menu);

    const rect = anchor.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.style.left = `${rect.left + window.scrollX}px`;

    function close() {
      menu.remove();
      document.removeEventListener('mousedown', onOutsideClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      if (closeActiveMenu === close) closeActiveMenu = null;
    }

    function onOutsideClick(e) {
      if (!menu.contains(e.target)) close();
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') close();
    }

    document.addEventListener('mousedown', onOutsideClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    closeActiveMenu = close;
  }

  const HOLD_MS = 450;

  // A single click copies immediately using the configured defaults
  // (format, and — for list buttons — list style). Click-and-hold (past
  // HOLD_MS) instead opens the Markdown/Rich Text menu; if `opts.withStyle`
  // is set (the three list buttons), picking a format then click-through
  // opens a second popup, at the same spot, to also pick a list style.
  // `buildContent(format, style)` returns { plain, html } or a Promise of
  // it (for the "all pages" button, which needs to walk pagination first)
  // — either way this shows a busy/success/error state on the button.
  function attachCopyBehavior(btn, buildContent, opts = {}) {
    let holdTimer = null;
    let longPressFired = false;

    function runCopy(format, style) {
      const result = buildContent(format, style);
      const finish = ({ plain, html }) => {
        copyInFormat(format, plain, html);
        if (opts.onDone) opts.onDone();
      };

      if (result && typeof result.then === 'function') {
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳';
        result
          .then((payload) => {
            finish(payload);
            btn.textContent = '✅';
          })
          .catch((e) => {
            console.error('[PR Link Copier]', e);
            btn.textContent = '⚠️';
          })
          .finally(() => {
            btn.disabled = false;
            setTimeout(() => { btn.textContent = original; }, 1500);
          });
      } else {
        finish(result);
        flash(btn, '✅');
      }
    }

    btn.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      longPressFired = false;
      holdTimer = setTimeout(() => {
        longPressFired = true;
        // Clicking a format item commits it with the default list style
        // right away. Only holding on that item drills into the style
        // sub-menu — same click-vs-hold split as the button itself.
        const formatItems = opts.withStyle
          ? FORMAT_OPTIONS.map((opt) => ({
              ...opt,
              onHold: () => showMenu(btn, STYLE_OPTIONS, (style) => runCopy(opt.value, style)),
            }))
          : FORMAT_OPTIONS;
        showMenu(btn, formatItems, (format) => runCopy(format, getDefaultListStyle()));
      }, HOLD_MS);
    });

    ['mouseup', 'mouseleave'].forEach((evt) => btn.addEventListener(evt, () => clearTimeout(holdTimer)));

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (longPressFired) {
        longPressFired = false;
        return;
      }
      runCopy(getDefaultFormat(), getDefaultListStyle());
    });
  }

  function makeIconButton(icon, tooltip) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-octicon pr-md-copier-btn';
    btn.title = tooltip;
    btn.textContent = icon;
    return btn;
  }

  // ---- Button 1: single PR detail page, next to the title ----
  function injectDetailButton() {
    const h1 = document.querySelector('h1.gh-header-title');
    const bdi = h1 && h1.querySelector('bdi.js-issue-title');
    if (!h1 || !bdi || h1.querySelector('.pr-md-copier-btn')) return;

    const title = bdi.textContent.trim();
    const url = location.href.split(/[?#]/)[0];

    const btn = makeIconButton('📋', 'Copy title & link — click for default format, hold to choose');
    btn.style.marginLeft = '8px';
    attachCopyBehavior(btn, () => ({ plain: toMdLink(title, url), html: toHtmlLink(title, url) }));
    h1.appendChild(btn);
  }

  // ---- Buttons 2-4: PR list page ----
  function rowData(row) {
    const link = row.querySelector('a.markdown-title[data-hovercard-type="pull_request"]');
    if (!link) return null;
    return {
      title: link.textContent.trim(),
      url: new URL(link.getAttribute('href'), location.origin).href,
    };
  }

  function rowsFromDoc(doc) {
    return Array.from(doc.querySelectorAll('.js-issue-row')).map(rowData).filter(Boolean);
  }

  async function collectAllPages() {
    let items = rowsFromDoc(document);
    let nextLink = document.querySelector('.paginate-container a.next_page[rel="next"]');
    let guard = 0;
    while (nextLink && guard < 200) {
      guard++;
      const nextUrl = new URL(nextLink.getAttribute('href'), location.origin).href;
      const res = await fetch(nextUrl, { credentials: 'same-origin' });
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      items = items.concat(rowsFromDoc(doc));
      nextLink = doc.querySelector('.paginate-container a.next_page[rel="next"]');
    }
    return items;
  }

  function findListBox() {
    return Array.from(document.querySelectorAll('.Box')).find((b) => b.querySelector('.js-issue-row'));
  }

  // ---- Per-row button: next to each PR title in the list ----
  function injectRowButtons() {
    document.querySelectorAll('.js-issue-row').forEach((row) => {
      const link = row.querySelector('a.markdown-title[data-hovercard-type="pull_request"]');
      if (!link || row.querySelector('.pr-md-copier-row-btn')) return;

      const title = link.textContent.trim();
      const url = new URL(link.getAttribute('href'), location.origin).href;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pr-md-copier-row-btn btn-link';
      btn.title = 'Copy title + link — click for default format, hold to choose';
      btn.textContent = '📋';
      btn.style.marginLeft = '6px';
      btn.style.fontSize = '12px';
      attachCopyBehavior(btn, () => ({ plain: toMdLink(title, url), html: toHtmlLink(title, url) }));
      link.insertAdjacentElement('afterend', btn);
    });
  }

  function injectListButtons() {
    const box = findListBox();
    if (!box || document.querySelector('.pr-md-copier-toolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.className = 'pr-md-copier-toolbar d-flex flex-justify-end mb-2';
    toolbar.style.gap = '8px';

    const btnPage = makeIconButton('📄', 'Copy PRs (this page) — click for defaults, hold to choose format/style');
    attachCopyBehavior(
      btnPage,
      (format, style) => {
        const items = rowsFromDoc(document);
        return { plain: toMdListStyled(items, style), html: toHtmlListStyled(items, style) };
      },
      { withStyle: true }
    );

    const btnAll = makeIconButton('📚', 'Copy PRs (all pages) — click for defaults, hold to choose format/style');
    attachCopyBehavior(
      btnAll,
      async (format, style) => {
        const items = await collectAllPages();
        return { plain: toMdListStyled(items, style), html: toHtmlListStyled(items, style) };
      },
      { withStyle: true }
    );

    // Reuse the list's native per-row bulk-select checkboxes instead of
    // injecting new ones. GHE hides them below a ~768px breakpoint via
    // `.d-none { display: none !important; }` — a plain style.display
    // assignment can't beat that !important, so force it with the same
    // priority to keep them visible regardless of window width.
    function rowCheckboxes() {
      return Array.from(document.querySelectorAll('.js-issue-row input.js-issues-list-check'));
    }

    rowCheckboxes().forEach((cb) => {
      const label = cb.closest('label');
      if (label) label.style.setProperty('display', 'block', 'important');
    });

    function updateCopySelectedState() {
      btnCopySelected.disabled = !rowCheckboxes().some((cb) => cb.checked);
    }

    const btnCopySelected = makeIconButton('☑️', 'Copy checked PRs — click for defaults, hold to choose format/style');
    btnCopySelected.disabled = true;

    attachCopyBehavior(
      btnCopySelected,
      (format, style) => {
        const items = rowCheckboxes()
          .filter((cb) => cb.checked)
          .map((cb) => rowData(cb.closest('.js-issue-row')))
          .filter(Boolean);
        return { plain: toMdListStyled(items, style), html: toHtmlListStyled(items, style) };
      },
      { withStyle: true }
    );

    // Delegated listener: rows come and go across Turbo navigations, but
    // the toolbar (and this listener) is only created once per page load.
    box.addEventListener('change', (e) => {
      if (e.target.matches('input.js-issues-list-check')) updateCopySelectedState();
    });

    toolbar.appendChild(btnPage);
    toolbar.appendChild(btnAll);
    toolbar.appendChild(btnCopySelected);
    box.parentElement.insertBefore(toolbar, box);
  }

  function injectAll() {
    injectDetailButton();
    injectListButtons();
    injectRowButtons();
  }

  injectAll();

  // GHE instance navigates via Turbo (no full page reload between
  // list/detail pages), so re-run injection on Turbo's lifecycle events.
  ['turbo:load', 'turbo:frame-load', 'turbo:render', 'turbo:frame-render'].forEach((evt) =>
    document.addEventListener(evt, injectAll)
  );

  // Fallback in case a Turbo event above doesn't fire for this GHE version.
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      injectAll();
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
