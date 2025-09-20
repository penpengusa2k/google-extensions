
const q = document.getElementById('q');
const sectionPinned = document.getElementById('sectionPinned');
const listPinned = document.getElementById('listPinned');
const sectionResults = document.getElementById('sectionResults');
const listResults = document.getElementById('listResults');
const resultsTitle = document.getElementById('resultsTitle');

let pinned = [];
let historyItems = [];
let tabsMode = false;
let currentItems = [];
let selectionIndex = 0;

function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }
function normalize(s) { return (s || "").toLowerCase(); }
function scoreMatch(q, title, url) {
  const nQ = normalize(q), nT = normalize(title), nU = normalize(url); let score = 0;
  if (!nQ) return 0;
  if (nT.startsWith(nQ)) score += 4;
  if (nU.startsWith(nQ)) score += 3;
  if (nT.includes(nQ)) score += 2;
  if (nU.includes(nQ)) score += 1;
  return score;
}

function itemRow(item, i, isPinned=false) {
  const li = document.createElement('li');
  li.className = 'item';
  li.id = (isPinned ? 'p-' : 'r-') + i;
  li.setAttribute('role', 'option');
  li.dataset.url = item.url;
  li.dataset.title = item.title || item.url;
  const img = document.createElement('img'); img.className = 'fav'; img.src = item.favIconUrl || '../icons/16.png';
  const main = document.createElement('div'); main.className = 'main';
  const title = document.createElement('div'); title.className = 'title'; title.textContent = item.title || item.url;
  const url = document.createElement('div'); url.className = 'url'; url.textContent = item.url;
  main.append(title, url);
  const star = document.createElement('button');
  star.className = 'star';
  const isStarred = pinned.some(p => p.url === item.url);
  star.textContent = isStarred ? '★' : '☆';
  star.title = isStarred ? '固定を解除' : '固定する';
  star.addEventListener('click', async (e) => {
    e.stopPropagation();
    await chrome.runtime.sendMessage({ type: 'togglePin', url: item.url, title: item.title });
    await loadStateAndRender();
  });
  li.append(img, main, star);
  li.addEventListener('click', () => openUrl(item.url));
  return li;
}

async function openUrl(url) { await chrome.runtime.sendMessage({ type: 'openUrl', url }); window.close(); }

async function loadStateAndRender() {
  const state = await chrome.runtime.sendMessage({ type: 'getState' });
  pinned = state.pinned || [];
  historyItems = (state.history || []).slice(0, 100);
  sectionPinned.classList.toggle('hidden', pinned.length === 0);
  listPinned.innerHTML = '';
  pinned.forEach((p, i) => listPinned.appendChild(itemRow({ ...p, favIconUrl: null }, i, true)));
  await refreshResults();
}

async function getAllTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('edge://') && !t.url.startsWith('about:'))
    .map(t => ({ url: t.url, title: t.title || t.url, favIconUrl: t.favIconUrl }));
}

async function refreshResults() {
  const query = q.value.trim();
  tabsMode = query.startsWith('/t');
  let items = [];
  if (tabsMode) {
    resultsTitle.textContent = 'Tabs';
    const term = query.replace(/^\/t\s*/, '');
    const tabs = await getAllTabs();
    items = rankFilter(tabs, term);
  } else {
    resultsTitle.textContent = 'History';
    items = rankFilter(historyItems, query);
  }
  currentItems = items;
  listResults.innerHTML = '';
  if (items.length === 0) {
    const div = document.createElement('div'); div.className = 'empty'; div.textContent = '該当なし'; listResults.appendChild(div);
    selectionIndex = -1;
  } else {
    items.forEach((it, i) => listResults.appendChild(itemRow(it, i, false)));
    selectionIndex = 0; applySelection();
  }
}

function rankFilter(items, query) {
  const q = query.trim(); if (!q) return items.slice(0, 50);
  return items.map(it => ({ it, s: scoreMatch(q, it.title || '', it.url || '') }))
              .filter(x => x.s > 0).sort((a,b) => b.s - a.s).map(x => x.it).slice(0, 50);
}

function applySelection() {
  const lis = [...listResults.querySelectorAll('li.item')];
  lis.forEach(li => li.removeAttribute('aria-selected'));
  if (selectionIndex >= 0 && lis[selectionIndex]) {
    lis[selectionIndex].setAttribute('aria-selected', 'true');
    lis[selectionIndex].scrollIntoView({ block: 'nearest' });
  }
}

q.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); const len = currentItems.length; if (len > 0) { selectionIndex = Math.min(len - 1, selectionIndex + 1); applySelection(); } }
  else if (e.key === 'ArrowUp') { e.preventDefault(); const len = currentItems.length; if (len > 0) { selectionIndex = Math.max(0, selectionIndex - 1); applySelection(); } }
  else if (e.key === 'Enter') { e.preventDefault(); if (selectionIndex >= 0 && currentItems[selectionIndex]) openUrl(currentItems[selectionIndex].url); }
  else if (e.key === 'Escape') { window.close(); }
});
q.addEventListener('input', debounce(refreshResults, 120));
loadStateAndRender(); q.focus();
