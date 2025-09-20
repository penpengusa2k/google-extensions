
let active = null;
const MAX_HISTORY = 10;
const MAX_PINNED = 10;
const DEFAULT_SETTINGS = { dwellSeconds: 3, maxHistory: MAX_HISTORY };

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
  const dwellMs = (state.settings?.dwellSeconds ?? 3) * 1000;
  if (elapsedMs < dwellMs) return;
  if (!tab || isSkippableUrl(tab.url)) return;
  const item = { url: tab.url, title: tab.title || tab.url, favIconUrl: tab.favIconUrl, lastVisitedAt: Date.now() };
  const filtered = state.history.filter(h => h.url != item.url);
  const next = [item, ...filtered].slice(0, state.settings.maxHistory || MAX_HISTORY);
  await setState({ history: next });
}
async function updateActiveTo(tabId, windowId) {
  const now = Date.now();
  if (active && active.tabId !== tabId) {
    try { const prevTab = await chrome.tabs.get(active.tabId); await recordIfEligible(now - active.startedAt, prevTab); } catch (e) {}
  }
  if (tabId > 0 && windowId > 0) active = { tabId, windowId, startedAt: now }; else active = null;
}
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => { await updateActiveTo(tabId, windowId); });
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  const now = Date.now();
  if (active) { try { const prev = await chrome.tabs.get(active.tabId); await recordIfEligible(now - active.startedAt, prev); } catch (e) {} }
  if (windowId === chrome.windows.WINDOW_ID_NONE) active = null;
  else { const [tab] = await chrome.tabs.query({ windowId, active: true }); if (tab) await updateActiveTo(tab.id, windowId); }
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === active?.tabId && changeInfo.status === "complete") { active.startedAt = Date.now(); }
});
async function openPaletteWindow() {
  const url = chrome.runtime.getURL("ui/palette.html");
  const all = await chrome.windows.getAll({ populate: true, windowTypes: ["popup", "normal"] });
  for (const w of all) for (const t of (w.tabs || [])) if (t.url === url) { await chrome.windows.update(w.id, { focused: true }); await chrome.tabs.update(t.id, { active: true }); return; }
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
chrome.commands.onCommand.addListener(async (cmd) => { if (cmd === "open-palette") await openPaletteWindow(); });
chrome.action.onClicked.addListener(async () => { await openPaletteWindow(); });
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "togglePin") {
      const { url, title } = msg;
      const { pinned } = await getState();
      const idx = pinned.findIndex(p => p.url === url);
      let next = idx >= 0 ? pinned.filter(p => p.url !== url) : [{ url, title }, ...pinned].slice(0, MAX_PINNED);
      await setState({ pinned: next }); sendResponse({ ok: true });
    } else if (msg?.type === "getState") {
      const s = await getState(); sendResponse(s);
    } else if (msg?.type === "setState") {
      await setState(msg.state);
      sendResponse({ ok: true });
    } else if (msg?.type === "clearHistory") {
      await setState({ history: [] });
      sendResponse({ ok: true });
    } else if (msg?.type === "openUrl") {
      const targetUrl = msg.url; const [existing] = await chrome.tabs.query({ url: targetUrl });
      if (existing) { await chrome.windows.update(existing.windowId, { focused: true }); await chrome.tabs.update(existing.id, { active: true }); }
      else { await chrome.tabs.create({ url: targetUrl }); }
      sendResponse({ ok: true });
    }
  })();
  return true;
});
