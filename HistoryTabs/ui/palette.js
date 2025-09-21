const STAR_FILLED = String.fromCharCode(0x2605);
const STAR_OUTLINE = String.fromCharCode(0x2606);
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

const dwellTimeSlider = document.getElementById("dwellTime");
const dwellTimeValue = document.getElementById("dwellTimeValue");
const maxHistorySlider = document.getElementById("maxHistory");
const maxHistoryValue = document.getElementById("maxHistoryValue");
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
  if (window.parent && window.parent !== window) {
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
    await chrome.runtime.sendMessage({ type: "togglePin", url: item.url, title: item.title, favIconUrl: item.favIconUrl });
    await loadStateAndRender();
  });

  li.append(img, main, star);
  li.addEventListener("click", () => openUrl(item.url));
  return li;
}

async function openUrl(url) {
  await chrome.runtime.sendMessage({ type: "openUrl", url });
  closePalette();
}

async function loadStateAndRender() {
  const state = await chrome.runtime.sendMessage({ type: "getState" });
  pinned = state.pinned || [];
  historyItems = (state.history || []).slice(0, 100);
  settings = state.settings || { dwellSeconds: 3, maxHistory: 10 };

  sectionPinned.classList.toggle("hidden", pinned.length === 0);
  listPinned.innerHTML = "";
  pinned.forEach((p, i) => listPinned.appendChild(itemRow(p, i, true)));

  updateSettingsUI();
  await refreshResults();
}

async function getAllTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter(t => t.url && !t.url.startsWith("chrome://") && !t.url.startsWith("edge://") && !t.url.startsWith("about:"))
    .map(t => ({ url: t.url, title: t.title || t.url, favIconUrl: t.favIconUrl }));
}

async function refreshResults() {
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
    selectionIndex = 0;
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
  dwellTimeSlider.value = settings.dwellSeconds;
  dwellTimeValue.textContent = settings.dwellSeconds;
  maxHistorySlider.value = settings.maxHistory;
  maxHistoryValue.textContent = settings.maxHistory;
}

async function saveSettings() {
  await chrome.runtime.sendMessage({ type: "setState", state: { settings } });
}

function handleKeyNavigation(e) {
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
  }
}

q.addEventListener("keydown", handleKeyNavigation);
q.addEventListener("input", debounce(refreshResults, 120));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closePalette();
  }
});

viewSearchBtn.addEventListener("click", () => switchView("search"));
viewSettingsBtn.addEventListener("click", () => switchView("settings"));

dwellTimeSlider.addEventListener("input", (e) => {
  settings.dwellSeconds = parseInt(e.target.value, 10);
  dwellTimeValue.textContent = settings.dwellSeconds;
});
dwellTimeSlider.addEventListener("change", saveSettings);

maxHistorySlider.addEventListener("input", (e) => {
  settings.maxHistory = parseInt(e.target.value, 10);
  maxHistoryValue.textContent = settings.maxHistory;
});
maxHistorySlider.addEventListener("change", saveSettings);

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
focusSearch();
