const OVERLAYS = {
  palette: {
    overlayId: "history-tabs-palette-overlay",
    iframeId: "history-tabs-palette-iframe",
    src: "ui/palette.html",
    closeMessage: "closePalette"
  },
  todo: {
    overlayId: "history-tabs-todo-overlay",
    iframeId: "history-tabs-todo-iframe",
    src: "ui/todo.html",
    closeMessage: "closeTodo"
  }
};

function removeOverlay(key) {
  const config = OVERLAYS[key];
  if (!config) return;
  const existing = document.getElementById(config.overlayId);
  if (existing) existing.remove();
}

function removeAllOverlays() {
  Object.keys(OVERLAYS).forEach(removeOverlay);
}

function createOverlay(key) {
  const config = OVERLAYS[key];
  if (!config) return;

  if (!document.body) {
    window.addEventListener(
      "DOMContentLoaded",
      () => createOverlay(key),
      { once: true }
    );
    return;
  }

  if (document.getElementById(config.overlayId)) return;

  const overlay = document.createElement("div");
  overlay.id = config.overlayId;
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.35);
    backdrop-filter: blur(1px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
  `;

  overlay.addEventListener("pointerdown", (event) => {
    if (event.target === overlay) {
      removeOverlay(key);
    }
  });

  const iframe = document.createElement("iframe");
  iframe.id = config.iframeId;
  iframe.src = chrome.runtime.getURL(config.src);
  iframe.setAttribute("allow", "clipboard-read; clipboard-write");
  iframe.style.cssText = `
    width: 750px;
    max-width: calc(100% - 32px);
    height: 500px;
    max-height: calc(100% - 32px);
    border: none;
    border-radius: 12px;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.28);
    overflow: hidden;
    background: transparent;
  `;

  iframe.addEventListener("load", () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.postMessage({ type: "focusInput" }, "*");
      } catch (_) {
        /* noop */
      }
    }, 50);
  });

  overlay.appendChild(iframe);
  document.body.appendChild(overlay);
}

function toggleOverlay(key) {
  const config = OVERLAYS[key];
  if (!config) return;
  if (document.getElementById(config.overlayId)) {
    removeOverlay(key);
  } else {
    createOverlay(key);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "togglePalette") {
    toggleOverlay("palette");
    sendResponse({ ok: true });
  } else if (message.type === "toggleTodo") {
    toggleOverlay("todo");
    sendResponse({ ok: true });
  }
  return true;
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    removeAllOverlays();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    removeAllOverlays();
  }
});

window.addEventListener("message", (event) => {
  const messageType = event.data?.type;
  if (!messageType) return;
  for (const [key, config] of Object.entries(OVERLAYS)) {
    if (messageType === config.closeMessage) {
      removeOverlay(key);
      break;
    }
  }
});
