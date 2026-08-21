// ==UserScript==
// @name         GitHub PR Title Markdown Copier
// @namespace    github-pr-title-md-copier
// @version      1.1
// @author       Jacky To
// @description  Copy PR title+link as markdown, from a PR page or the PR list table
// @include      https://git.corp.*.com/*
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  'use strict';

  function toMdLink(title, url) {
    return `[${title.replace(/[[\]]/g, '\\$&')}](${url})`;
  }

  function copyText(text) {
    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(text, 'text');
    } else {
      navigator.clipboard.writeText(text).catch((e) => console.error('[PR MD Copier] clipboard write failed', e));
    }
  }

  function flash(btn, label) {
    const original = btn.textContent;
    btn.textContent = label;
    setTimeout(() => { btn.textContent = original; }, 1200);
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

    const btn = makeIconButton('📋', 'Copy title & link as Markdown');
    btn.style.marginLeft = '8px';
    btn.addEventListener('click', () => {
      copyText(toMdLink(title, url));
      flash(btn, '✅');
    });
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

  function toMdList(items) {
    return items.map((i) => `- ${toMdLink(i.title, i.url)}`).join('\n');
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
      btn.title = 'Copy title + link as markdown';
      btn.textContent = '📋';
      btn.style.marginLeft = '6px';
      btn.style.fontSize = '12px';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        copyText(toMdLink(title, url));
        flash(btn, '✅');
      });
      link.insertAdjacentElement('afterend', btn);
    });
  }

  function injectListButtons() {
    const box = findListBox();
    if (!box || document.querySelector('.pr-md-copier-toolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.className = 'pr-md-copier-toolbar d-flex flex-justify-end mb-2';
    toolbar.style.gap = '8px';

    const btnPage = makeIconButton('📄', 'Copy PRs (this page) as a Markdown list');
    btnPage.addEventListener('click', () => {
      copyText(toMdList(rowsFromDoc(document)));
      flash(btnPage, '✅');
    });

    const btnAll = makeIconButton('📚', 'Copy PRs (all pages) as a Markdown list');
    btnAll.addEventListener('click', async () => {
      const original = btnAll.textContent;
      btnAll.disabled = true;
      btnAll.textContent = '⏳';
      try {
        const items = await collectAllPages();
        copyText(toMdList(items));
        btnAll.textContent = '✅';
      } catch (e) {
        btnAll.textContent = '⚠️';
        console.error('[PR MD Copier]', e);
      } finally {
        btnAll.disabled = false;
        setTimeout(() => { btnAll.textContent = original; }, 1500);
      }
    });

    // Reuse the list's native per-row bulk-select checkboxes (normally
    // hidden below GHE's `md` breakpoint) instead of injecting new ones.
    function rowCheckboxes() {
      return Array.from(document.querySelectorAll('.js-issue-row input.js-issues-list-check'));
    }

    let selectMode = false;

    function setCheckboxesVisible(visible) {
      rowCheckboxes().forEach((cb) => {
        const label = cb.closest('label');
        if (label) label.style.display = visible ? 'block' : '';
        if (!visible) cb.checked = false;
      });
    }

    function updateCopySelectedState() {
      btnCopySelected.disabled = !rowCheckboxes().some((cb) => cb.checked);
    }

    const btnToggleSelect = makeIconButton('☑️', 'Select PRs to copy');
    const btnCopySelected = makeIconButton('📋', 'Copy selected PRs as a Markdown list');
    btnCopySelected.style.display = 'none';
    btnCopySelected.disabled = true;

    btnToggleSelect.addEventListener('click', () => {
      selectMode = !selectMode;
      setCheckboxesVisible(selectMode);
      btnCopySelected.style.display = selectMode ? '' : 'none';
      btnToggleSelect.title = selectMode ? 'Cancel PR selection' : 'Select PRs to copy';
      updateCopySelectedState();
    });

    btnCopySelected.addEventListener('click', () => {
      const items = rowCheckboxes()
        .filter((cb) => cb.checked)
        .map((cb) => rowData(cb.closest('.js-issue-row')))
        .filter(Boolean);
      copyText(toMdList(items));
      flash(btnCopySelected, '✅');

      selectMode = false;
      setCheckboxesVisible(false);
      btnCopySelected.style.display = 'none';
      btnToggleSelect.title = 'Select PRs to copy';
    });

    // Delegated listener: rows come and go across Turbo navigations, but
    // the toolbar (and this listener) is only created once per page load.
    box.addEventListener('change', (e) => {
      if (e.target.matches('input.js-issues-list-check')) updateCopySelectedState();
    });

    toolbar.appendChild(btnPage);
    toolbar.appendChild(btnAll);
    toolbar.appendChild(btnToggleSelect);
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
