let active = null;
const MAX_HISTORY = 10;
const MAX_PINNED = 10;
const DEFAULT_SETTINGS = { dwellSeconds: 3, maxHistory: MAX_HISTORY, excludedPatterns: [] };

function matchesExcluded(url, patterns) {
  if (!url || !Array.isArray(patterns) || patterns.length === 0) return false;
  for (const pattern of patterns) {
    if (!pattern) continue;
    const escaped = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&");
    const regexPattern = `^${escaped.replace(/\*/g, ".*")}$`;
    try {
      if (new RegExp(regexPattern, "i").test(url)) return true;
    } catch (_) {
      // ignore malformed pattern
    }
  }
  return false;
}

function isSkippableUrl(url) {
  if (!url) return true;
  return url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:");
}

async function getState() {
  const { history, pinned, settings } = await chrome.storage.sync.get(["history", "pinned", "settings"]);
  return {
    history: Array.isArray(history) ? history : [],
    pinned: Array.isArray(pinned) ? pinned.slice(0, MAX_PINNED) : [],
    settings: { ...DEFAULT_SETTINGS, ...(settings || {}) }
  };
}
async function setState(partial) { await chrome.storage.sync.set(partial); }

async function recordIfEligible(elapsedMs, tab) {
  const state = await getState();
  const settings = state.settings || DEFAULT_SETTINGS;
  const dwellMs = (settings.dwellSeconds ?? 3) * 1000;
  const excludedPatterns = Array.isArray(settings.excludedPatterns) ? settings.excludedPatterns : [];
  if (elapsedMs < dwellMs) return;
  if (!tab || isSkippableUrl(tab.url)) return;
  if (matchesExcluded(tab.url, excludedPatterns)) return;
  if (state.pinned.some(p => p.url === tab.url)) return;
  const item = { url: tab.url, title: tab.title || tab.url, favIconUrl: tab.favIconUrl, lastVisitedAt: Date.now() };
  const filtered = state.history.filter(h => h.url != item.url);
  const next = [item, ...filtered].slice(0, state.settings.maxHistory || MAX_HISTORY);
  await setState({ history: next });
}
async function updateActiveTo(tabId, windowId) {
  const now = Date.now();
  if (active && active.tabId !== tabId) {
    try {
      const prevTab = await chrome.tabs.get(active.tabId);
      await recordIfEligible(now - active.startedAt, prevTab);
    } catch (e) {
      /* noop */
    }
  }
  if (tabId > 0 && windowId > 0) active = { tabId, windowId, startedAt: now }; else active = null;
}
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => { await updateActiveTo(tabId, windowId); });
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  const now = Date.now();
  if (active) {
    try {
      const prev = await chrome.tabs.get(active.tabId);
      await recordIfEligible(now - active.startedAt, prev);
    } catch (e) {
      /* noop */
    }
  }
  if (windowId === chrome.windows.WINDOW_ID_NONE) active = null;
  else {
    const [tab] = await chrome.tabs.query({ windowId, active: true });
    if (tab) await updateActiveTo(tab.id, windowId);
  }
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === active?.tabId && changeInfo.status === "complete") { active.startedAt = Date.now(); }
});

async function openPaletteWindow() {
  const url = chrome.runtime.getURL("ui/palette.html");
  const all = await chrome.windows.getAll({ populate: true, windowTypes: ["popup", "normal"] });
  for (const w of all) {
    for (const t of (w.tabs || [])) {
      if (t.url === url) {
        await chrome.windows.update(w.id, { focused: true });
        await chrome.tabs.update(t.id, { active: true });
        return;
      }
    }
  }
  await chrome.windows.create({
    url,
    type: "popup",
    width: 750,
    height: 500,
    left: 200,
    top: 150,
    focused: true
  });
}

function isMissingReceiverError(error) {
  if (!error) return false;
  const message = error.message || String(error);
  return message.includes("Receiving end does not exist") || message.includes("Could not establish connection");
}

async function tryTogglePalette(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "togglePalette" });
    return true;
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      console.warn("Failed to toggle palette overlay.", error);
      return false;
    }
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["cs/content_script.js"]
    });
    await chrome.tabs.sendMessage(tabId, { type: "togglePalette" });
    return true;
  } catch (injectionError) {
    console.warn("Failed to inject palette overlay content script.", injectionError);
    return false;
  }
}

async function togglePaletteForActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  if (isSkippableUrl(tab.url)) {
    await openPaletteWindow();
    return;
  }
  const toggled = await tryTogglePalette(tab.id);
  if (!toggled) {
    await openPaletteWindow();
  }
}

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd === "open-palette") await togglePaletteForActiveTab();
});
chrome.action.onClicked.addListener(async () => { await togglePaletteForActiveTab(); });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "togglePin") {
      const { url, title, favIconUrl } = msg;
      const { history, pinned, settings } = await getState();
      const maxHistory = settings.maxHistory || MAX_HISTORY;
      const idx = pinned.findIndex(p => p.url === url);
      let nextPinned = [...pinned];
      let nextHistory = [...history];

      if (idx >= 0) { // Unpin
        const [item] = nextPinned.splice(idx, 1);
        nextHistory = [item, ...nextHistory].slice(0, maxHistory);
      } else { // Pin
        nextHistory = nextHistory.filter(h => h.url !== url);
        const itemToPin = history.find(h => h.url === url) || { url, title, favIconUrl };
        nextPinned = [itemToPin, ...nextPinned].slice(0, MAX_PINNED);
      }
      
      await setState({ pinned: nextPinned, history: nextHistory });
      sendResponse({ ok: true });
    } else if (msg?.type === "getState") {
      const s = await getState(); sendResponse(s);
    } else if (msg?.type === "setState") {
      await setState(msg.state);
      sendResponse({ ok: true });
    } else if (msg?.type === "clearHistory") {
      await setState({ history: [] });
      sendResponse({ ok: true });
    } else if (msg?.type === "openUrl") {
      const targetUrl = msg.url;
      if (!targetUrl) {
        sendResponse({ ok: false, error: "missing-url" });
        return;
      }

      const possibleTabs = await chrome.tabs.query({ url: targetUrl });
      const originTabId = sender.tab?.id;
      const existing = possibleTabs.find(tab => tab.id !== originTabId);

      if (existing) {
        await chrome.windows.update(existing.windowId, { focused: true });
        await chrome.tabs.update(existing.id, { active: true });
      } else {
        const createOptions = { url: targetUrl };
        if (sender.tab?.windowId !== undefined) createOptions.windowId = sender.tab.windowId;
        if (sender.tab?.index !== undefined) createOptions.index = sender.tab.index + 1;
        await chrome.tabs.create(createOptions);
      }
      sendResponse({ ok: true });
    } else if (msg?.type === "deleteEntry") {
      const targetUrl = msg.url;
      if (!targetUrl) {
        sendResponse({ ok: false, error: "missing-url" });
        return;
      }
      const { history, pinned } = await getState();
      const nextHistory = (history || []).filter(item => item.url !== targetUrl);
      const nextPinned = (pinned || []).filter(item => item.url !== targetUrl);
      await setState({ history: nextHistory, pinned: nextPinned });
      sendResponse({ ok: true });
    }
  })();
  return true;
});
