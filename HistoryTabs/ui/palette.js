const STAR_FILLED = String.fromCharCode(0x2605);
const STAR_OUTLINE = String.fromCharCode(0x2606);
const IS_EMBEDDED = window.parent && window.parent !== window;
const TITLE_UNPIN = '固定を解除';
const TITLE_PIN = '固定する';
const TEXT_EMPTY = '該当なし';
const CONFIRM_CLEAR = 'すべての履歴を削除します。よろしいですか？';

const q = document.getElementById("q");
const sectionPinned = document.getElementById("sectionPinned");
const listPinned = document.getElementById("listPinned");
const sectionResults = document.getElementById("sectionResults");
const listResults = document.getElementById("listResults");
const resultsTitle = document.getElementById("resultsTitle");

const viewSearchBtn = document.getElementById("viewSearchBtn");
const viewSettingsBtn = document.getElementById("viewSettingsBtn");
const searchView = document.getElementById("searchView");
const settingsView = document.getElementById("settingsView");

const dwellTimeInput = document.getElementById("dwellTime");
const maxHistoryInput = document.getElementById("maxHistory");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

let pinned = [];
let historyItems = [];
let tabsMode = false;
let currentItems = [];
let selectableItems = [];
let selectionIndex = 0;
let settings = {};

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function normalize(s) {
  return (s || "").toLowerCase();
}

function scoreMatch(q, title, url) {
  const nQ = normalize(q);
  const nT = normalize(title);
  const nU = normalize(url);
  let score = 0;
  if (!nQ) return 0;
  if (nT.startsWith(nQ)) score += 4;
  if (nU.startsWith(nQ)) score += 3;
  if (nT.includes(nQ)) score += 2;
  if (nU.includes(nQ)) score += 1;
  return score;
}

function closePalette() {
  if (IS_EMBEDDED) {
    window.parent.postMessage({ type: "closePalette" }, "*");
  }
  window.close();
}

function itemRow(item, i, isPinned = false) {
  const li = document.createElement("li");
  li.className = "item";
  li.id = (isPinned ? "p-" : "r-") + i;
  li.setAttribute("role", "option");
  li.dataset.url = item.url;
  li.dataset.title = item.title || item.url;

  const img = document.createElement("img");
  img.className = "fav";
  img.src = item.favIconUrl || "../icons/16.png";

  const main = document.createElement("div");
  main.className = "main";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = item.title || item.url;

  const url = document.createElement("div");
  url.className = "url";
  url.textContent = item.url;

  main.append(title, url);

  const star = document.createElement("button");
  star.className = "star";
  const isStarred = pinned.some(p => p.url === item.url);
  star.textContent = isStarred ? STAR_FILLED : STAR_OUTLINE;
  star.title = isStarred ? TITLE_UNPIN : TITLE_PIN;
  star.addEventListener("click", async (e) => {
    e.stopPropagation();
    await togglePinItem(item);
  });

  li.append(img, main, star);
  li.addEventListener("click", () => openUrl(item.url));
  return li;
}

async function openUrl(url) {
  await chrome.runtime.sendMessage({ type: "openUrl", url });
  closePalette();
}

async function togglePinItem(item) {
  if (!item) return;
  await chrome.runtime.sendMessage({
    type: "togglePin",
    url: item.url,
    title: item.title,
    favIconUrl: item.favIconUrl
  });
  await loadStateAndRender({ keepSelectionUrl: item.url });
}

async function deleteItem(item, options = {}) {
  if (!item) return;
  const { nextSelectionUrl } = options;
  await chrome.runtime.sendMessage({ type: "deleteEntry", url: item.url });
  await loadStateAndRender({ keepSelectionUrl: nextSelectionUrl });
}

async function loadStateAndRender(options = {}) {
  const { keepSelectionUrl } = options;
  const state = await chrome.runtime.sendMessage({ type: "getState" });
  pinned = state.pinned || [];
  historyItems = (state.history || []).slice(0, 100);
  settings = state.settings || { dwellSeconds: 3, maxHistory: 10 };

  sectionPinned.classList.toggle("hidden", pinned.length === 0);
  listPinned.innerHTML = "";
  pinned.forEach((p, i) => listPinned.appendChild(itemRow(p, i, true)));

  updateSettingsUI();
  await refreshResults({ keepSelectionUrl });
}

async function getAllTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter(t => t.url && !t.url.startsWith("chrome://") && !t.url.startsWith("edge://") && !t.url.startsWith("about:"))
    .map(t => ({ url: t.url, title: t.title || t.url, favIconUrl: t.favIconUrl }));
}

async function refreshResults(options = {}) {
  const { keepSelectionUrl } = options;
  const query = q.value.trim();
  tabsMode = query.startsWith("/t");
  let items = [];
  if (tabsMode) {
    resultsTitle.textContent = "Tabs";
    const term = query.replace(/^\/t\s*/, "");
    const tabs = await getAllTabs();
    items = rankFilter(tabs, term);
  } else {
    resultsTitle.textContent = "History";
    items = rankFilter(historyItems, query);
  }
  currentItems = items;
  listResults.innerHTML = "";

  selectableItems = [...pinned, ...currentItems];

  if (selectableItems.length === 0) {
    const div = document.createElement("div");
    div.className = "empty";
    div.textContent = TEXT_EMPTY;
    listResults.appendChild(div);
    selectionIndex = -1;
  } else {
    items.forEach((it, i) => listResults.appendChild(itemRow(it, i, false)));
    if (keepSelectionUrl) {
      const foundIndex = selectableItems.findIndex(it => it.url === keepSelectionUrl);
      selectionIndex = foundIndex >= 0 ? foundIndex : 0;
    } else {
      selectionIndex = 0;
    }
    applySelection();
  }
}

function rankFilter(items, query) {
  const qText = query.trim();
  if (!qText) return items.slice(0, 50);
  return items
    .map(it => ({ it, s: scoreMatch(qText, it.title || "", it.url || "") }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.it)
    .slice(0, 50);
}

function applySelection() {
  [...listPinned.querySelectorAll("li.item"), ...listResults.querySelectorAll("li.item")]
    .forEach(li => li.removeAttribute("aria-selected"));

  if (selectionIndex >= 0 && selectableItems[selectionIndex]) {
    const pinnedCount = pinned.length;
    let targetList;
    let targetIndex;

    if (selectionIndex < pinnedCount) {
      targetList = listPinned;
      targetIndex = selectionIndex;
    } else {
      targetList = listResults;
      targetIndex = selectionIndex - pinnedCount;
    }

    const li = targetList.children[targetIndex];
    if (li) {
      li.setAttribute("aria-selected", "true");
      li.scrollIntoView({ block: "nearest" });
    }
  }
}

function switchView(view) {
  if (view === "settings") {
    searchView.classList.remove("active");
    settingsView.classList.add("active");
    viewSearchBtn.classList.remove("active");
    viewSettingsBtn.classList.add("active");
  } else {
    settingsView.classList.remove("active");
    searchView.classList.add("active");
    viewSettingsBtn.classList.remove("active");
    viewSearchBtn.classList.add("active");
    focusSearch();
  }
}

function focusSearch() {
  q.focus();
  q.select();
}

function updateSettingsUI() {
  const clamp = (value, min, max, fallback) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
  };

  const nextDwell = clamp(settings.dwellSeconds, 1, 10, 3);
  const nextMax = clamp(settings.maxHistory, 1, 30, 10);
  const didAdjust = nextDwell !== settings.dwellSeconds || nextMax !== settings.maxHistory;
  settings.dwellSeconds = nextDwell;
  settings.maxHistory = nextMax;

  dwellTimeInput.value = settings.dwellSeconds;
  maxHistoryInput.value = settings.maxHistory;

  if (didAdjust) {
    saveSettings();
  }
}

async function saveSettings() {
  await chrome.runtime.sendMessage({ type: "setState", state: { settings } });
}

function initializeNumericSetting({ input, key, min, max, step }) {
  const clampNumber = (value) => Math.min(max, Math.max(min, value));
  const normalize = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return clampNumber(settings[key] ?? min);
    const snapped = step ? Math.round(numeric / step) * step : numeric;
    return clampNumber(snapped);
  };

  const commit = (value) => {
    const next = normalize(value);
    if (settings[key] !== next) {
      settings[key] = next;
      saveSettings();
    }
    input.value = next;
  };

  input.addEventListener("change", () => commit(input.value));
  input.addEventListener("blur", () => commit(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const current = settings[key] ?? min;
      commit(current + step);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const current = settings[key] ?? min;
      commit(current - step);
    }
  });
}

async function handleKeyNavigation(e) {
  const len = selectableItems.length;
  if (len === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    selectionIndex = (selectionIndex + 1) % len;
    applySelection();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selectionIndex = (selectionIndex - 1 + len) % len;
    applySelection();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (selectionIndex >= 0 && selectableItems[selectionIndex]) {
      openUrl(selectableItems[selectionIndex].url);
    }
  } else if (e.key === "Escape") {
    e.preventDefault();
    closePalette();
  } else if (
    !e.repeat &&
    !e.altKey &&
    ((e.ctrlKey && e.shiftKey) || (e.metaKey && e.shiftKey)) &&
    (e.key === "Shift" || e.key === "Control" || e.key === "Meta")
  ) {
    e.preventDefault();
    if (selectionIndex >= 0 && selectableItems[selectionIndex]) {
      await togglePinItem(selectableItems[selectionIndex]);
    }
  } else if (
    !e.repeat &&
    !e.altKey &&
    (e.ctrlKey || e.metaKey) &&
    !e.shiftKey &&
    e.key.toLowerCase() === "d"
  ) {
    e.preventDefault();
    if (selectionIndex >= 0 && selectableItems[selectionIndex]) {
      const current = selectableItems[selectionIndex];
      const fallback = selectableItems[selectionIndex + 1] || selectableItems[selectionIndex - 1];
      await deleteItem(current, { nextSelectionUrl: fallback?.url });
    }
  }
}

const debouncedRefresh = debounce(() => refreshResults(), 120);

q.addEventListener("keydown", handleKeyNavigation);
q.addEventListener("input", debouncedRefresh);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closePalette();
  }
});

viewSearchBtn.addEventListener("click", () => switchView("search"));
viewSettingsBtn.addEventListener("click", () => switchView("settings"));

initializeNumericSetting({
  input: dwellTimeInput,
  key: "dwellSeconds",
  min: 1,
  max: 10,
  step: 1
});

initializeNumericSetting({
  input: maxHistoryInput,
  key: "maxHistory",
  min: 1,
  max: 30,
  step: 1
});

clearHistoryBtn.addEventListener("click", async () => {
  if (confirm(CONFIRM_CLEAR)) {
    await chrome.runtime.sendMessage({ type: "clearHistory" });
    await loadStateAndRender();
  }
});

window.addEventListener("message", (event) => {
  if (event.data?.type === "focusInput") {
    focusSearch();
  } else if (event.data?.type === "closePalette") {
    closePalette();
  }
});

loadStateAndRender();

if (!IS_EMBEDDED) {
  requestAnimationFrame(() => focusSearch());
}

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('q');
  if (searchInput) {
    searchInput.focus();
  }
});
