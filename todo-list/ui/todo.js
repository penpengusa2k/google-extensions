const STORAGE_KEY = "todoState";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const IS_EMBEDDED = window.parent && window.parent !== window;

const todoInput = document.getElementById("todoInput");
const viewTodosBtn = document.getElementById("viewTodosBtn");
const viewCompletedBtn = document.getElementById("viewCompletedBtn");
const viewDeletedBtn = document.getElementById("viewDeletedBtn");
const viewSettingsBtn = document.getElementById("viewSettingsBtn");
const todosView = document.getElementById("todosView");
const completedView = document.getElementById("completedView");
const deletedView = document.getElementById("deletedView");
const settingsView = document.getElementById("settingsView");

const activeList = document.getElementById("activeList");
const completedList = document.getElementById("completedList");
const deletedList = document.getElementById("deletedList");

const activeEmpty = document.getElementById("activeEmpty");
const completedEmpty = document.getElementById("completedEmpty");
const deletedEmpty = document.getElementById("deletedEmpty");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const deleteAllBtn = document.getElementById("deleteAllBtn");

const footerCommands = Array.from(document.querySelectorAll(".footer .command"));
const VIEW_SEQUENCE = ["todos", "completed", "deleted"];

let state = { active: [], completed: [], deleted: [] };
let selectionIndex = -1;
let displayedItems = [];
let currentView = "todos";
let isComposing = false;
const ACTION_ANIMATION_CLASS_MAP = {
  completed: "todo-item--animate-completed",
  deleted: "todo-item--animate-deleted",
  restored: "todo-item--animate-restored"
};
const ACTION_ANIMATION_CLASSES = Object.values(ACTION_ANIMATION_CLASS_MAP);
const ACTION_SOURCE_ANIMATION_CLASS_MAP = {
  completed: "todo-item--animate-source-completed",
  deleted: "todo-item--animate-source-deleted",
  restored: "todo-item--animate-source-restored"
};
const ACTION_SOURCE_ANIMATION_CLASSES = Object.values(ACTION_SOURCE_ANIMATION_CLASS_MAP);

function closeTodo() {
  if (IS_EMBEDDED) {
    window.parent.postMessage({ type: "closeTodo" }, "*");
  }
  window.close();
}

function focusInput() {
  todoInput.focus({ preventScroll: true });
  todoInput.select();
}

function ensureId() {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `todo-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function sanitizeItem(raw, defaults = {}) {
  if (!raw || typeof raw !== "object") return null;
  const text = String(raw.text || "").trim();
  if (!text) return null;
  return {
    id: String(raw.id || ensureId()),
    text,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || Date.now(),
    ...defaults
  };
}

function sanitizeCompleted(raw) {
  const item = sanitizeItem(raw, {});
  if (!item) return null;
  return {
    ...item,
    completedAt: Number(raw.completedAt) || Date.now()
  };
}

function sanitizeDeleted(raw) {
  const item = sanitizeItem(raw, {});
  if (!item) return null;
  return {
    ...item,
    deletedAt: Number(raw.deletedAt) || Date.now()
  };
}

async function loadState() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  const rawState = stored[STORAGE_KEY] || {};
  const rawActive = Array.isArray(rawState.active) ? rawState.active : [];
  const rawCompleted = Array.isArray(rawState.completed) ? rawState.completed : [];
  const rawDeleted = Array.isArray(rawState.deleted) ? rawState.deleted : [];

  const active = rawActive
    .map(item => sanitizeItem(item))
    .filter(Boolean);

  const now = Date.now();
  const completed = rawCompleted
    .map(item => sanitizeCompleted(item))
    .filter(Boolean)
    .filter(item => now - item.completedAt <= WEEK_MS);

  const deleted = rawDeleted
    .map(item => sanitizeDeleted(item))
    .filter(Boolean)
    .filter(item => now - item.deletedAt <= WEEK_MS);

  state = { active, completed, deleted };
  await persistState();
}

function pruneStaleItems() {
  const threshold = Date.now() - WEEK_MS;
  state.completed = state.completed.filter(item => {
    const completedAt = Number(item.completedAt);
    return Number.isFinite(completedAt) && completedAt >= threshold;
  });
  state.deleted = state.deleted.filter(item => {
    const deletedAt = Number(item.deletedAt);
    return Number.isFinite(deletedAt) && deletedAt >= threshold;
  });
}

async function persistState() {
  pruneStaleItems();
  await chrome.storage.sync.set({ [STORAGE_KEY]: state });
}

function formatDate(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  const h = `${date.getHours()}`.padStart(2, "0");
  const min = `${date.getMinutes()}`.padStart(2, "0");
  return `${y}/${m}/${d} ${h}:${min}`;
}

function rebuildDisplayedItems() {
  if (currentView === "todos") {
    displayedItems = state.active.map(item => ({ item, status: "active" }));
  } else if (currentView === "completed") {
    displayedItems = state.completed.map(item => ({ item, status: "completed" }));
  } else if (currentView === "deleted") {
    displayedItems = state.deleted.map(item => ({ item, status: "deleted" }));
  } else {
    displayedItems = [];
  }
}

function applySelection() {
  [...activeList.querySelectorAll(".todo-item"), ...completedList.querySelectorAll(".todo-item"), ...deletedList.querySelectorAll(".todo-item")]
    .forEach(li => li.removeAttribute("aria-selected"));

  if (displayedItems.length === 0) {
    selectionIndex = -1;
    return;
  }

  if (selectionIndex < 0) selectionIndex = 0;
  if (selectionIndex >= displayedItems.length) selectionIndex = displayedItems.length - 1;

  const entry = displayedItems[selectionIndex];
  let listEl = activeList;
  if (entry.status === "completed") listEl = completedList;
  else if (entry.status === "deleted") listEl = deletedList;
  const target = listEl.querySelector(`[data-id="${entry.item.id}"]`);
  if (target) {
    target.setAttribute("aria-selected", "true");
    target.scrollIntoView({ block: "nearest" });
  }
}

function render(options = {}) {
  renderActiveList();
  renderCompletedList();
  renderDeletedList();
  rebuildDisplayedItems();

  const { keepId, animate } = options;
  if (keepId) {
    const idx = displayedItems.findIndex(entry => entry.item.id === keepId);
    if (idx >= 0) {
      selectionIndex = idx;
    }
  }

  applySelection();

  if (animate) {
    requestAnimationFrame(() => triggerActionAnimation(animate));
  }
}

function moveSelection(delta) {
  if (displayedItems.length === 0) {
    selectionIndex = -1;
    return;
  }
  selectionIndex = (selectionIndex + delta + displayedItems.length) % displayedItems.length;
  applySelection();
}

function getCurrentEntry() {
  if (selectionIndex < 0 || selectionIndex >= displayedItems.length) return null;
  return displayedItems[selectionIndex];
}

function updateFooterCommands(view) {
  footerCommands.forEach((el) => {
    if (el.classList.contains("command-common")) {
      el.hidden = false;
    } else if (el.classList.contains("command-todos")) {
      el.hidden = view !== "todos";
    } else if (el.classList.contains("command-completed")) {
      el.hidden = view !== "completed";
    } else if (el.classList.contains("command-deleted")) {
      el.hidden = view !== "deleted";
    }
  });
}

function cycleView(delta) {
  const currentIndex = VIEW_SEQUENCE.indexOf(currentView);
  const nextIndex = (currentIndex + delta + VIEW_SEQUENCE.length) % VIEW_SEQUENCE.length;
  switchView(VIEW_SEQUENCE[nextIndex]);
}

function createTodoItem(item, { status, includeActions = true }) {
  const li = document.createElement("li");
  li.className = "todo-item";
  li.dataset.id = item.id;
  li.dataset.status = status;
  li.setAttribute("role", "option");

  const main = document.createElement("div");
  main.className = "todo-main";

  const text = document.createElement("div");
  text.className = "todo-text";
  text.textContent = item.text;
  if (status === "completed") {
    text.classList.add("completed");
  } else if (status === "deleted") {
    text.classList.add("deleted");
  }

  const meta = document.createElement("div");
  meta.className = "todo-meta";
  meta.textContent = status === "completed"
    ? `完了: ${formatDate(item.completedAt)}`
    : status === "deleted"
      ? `削除: ${formatDate(item.deletedAt)}`
      : `作成: ${formatDate(item.updatedAt || item.createdAt)}`;

  main.append(text, meta);
  li.append(main);

  if (includeActions) {
    const actions = document.createElement("div");
    actions.className = "todo-actions";

    if (status === "completed") {
      actions.append(
        buildActionButton("restart_alt", "復活", async (event) => {
          event.stopPropagation();
          await restoreTodo(item.id, "completed");
        })
      );
    } else if (status === "deleted") {
      actions.append(
        buildActionButton("restore_from_trash", "復活", async (event) => {
          event.stopPropagation();
          await restoreTodo(item.id, "deleted");
        }),
        buildActionButton("delete_forever", "完全削除", async (event) => {
          event.stopPropagation();
          await deleteTodo(item.id, "deleted");
        })
      );
    }

    if (actions.childElementCount > 0) {
      li.append(actions);
    }
  }

  return li;
}

function buildActionButton(icon, title, handler) {
  const btn = document.createElement("button");
  btn.className = "icon-btn";
  btn.type = "button";
  btn.title = title;
  btn.setAttribute("aria-label", title);

  const i = document.createElement("i");
  i.className = "material-icons";
  i.textContent = icon;
  btn.append(i);

  btn.addEventListener("click", handler);
  return btn;
}

function renderActiveList() {
  activeList.innerHTML = "";
  state.active.forEach(item => {
    const li = createTodoItem(item, { status: "active", includeActions: true });
    activeList.appendChild(li);
  });
  activeList.classList.toggle("hidden", state.active.length === 0);
  activeEmpty.classList.toggle("hidden", state.active.length > 0);
}

function renderCompletedList() {
  completedList.innerHTML = "";
  state.completed.forEach(item => {
    const li = createTodoItem(item, { status: "completed", includeActions: true });
    completedList.appendChild(li);
  });
  completedList.classList.toggle("hidden", state.completed.length === 0);
  completedEmpty.classList.toggle("hidden", state.completed.length > 0);
}

function renderDeletedList() {
  deletedList.innerHTML = "";
  state.deleted.forEach(item => {
    const li = createTodoItem(item, { status: "deleted", includeActions: true });
    deletedList.appendChild(li);
  });
  deletedList.classList.toggle("hidden", state.deleted.length === 0);
  deletedEmpty.classList.toggle("hidden", state.deleted.length > 0);
}

async function addTodoFromInput() {
  const text = todoInput.value.trim();
  if (!text) return;
  todoInput.value = "";
  await addTodo(text);
}

async function addTodo(text) {
  const now = Date.now();
  const item = {
    id: ensureId(),
    text,
    createdAt: now,
    updatedAt: now
  };
  state.active.unshift(item);
  await persistState();
  render({ keepId: item.id });
}

async function completeTodo(id) {
  await animateSourceAction(id, "active", "completed");
  const index = state.active.findIndex(item => item.id === id);
  if (index < 0) return;
  const [item] = state.active.splice(index, 1);
  const completedItem = { ...item, completedAt: Date.now() };
  state.completed.unshift(completedItem);
  await persistState();
  const next = state.active[index] || state.active[index - 1];
  render({
    keepId: next?.id,
    animate: { id: completedItem.id, status: "completed", type: "completed" }
  });
}

async function restoreTodo(id, status = "completed") {
  if (status === "completed") {
    await animateSourceAction(id, "completed", "restored");
    const index = state.completed.findIndex(item => item.id === id);
    if (index < 0) return;
    const [item] = state.completed.splice(index, 1);
    const restored = {
      id: item.id,
      text: item.text,
      createdAt: item.createdAt,
      updatedAt: Date.now()
    };
    state.active.unshift(restored);
    await persistState();
    if (currentView === "completed") {
      const nextCompleted = state.completed[index] || state.completed[index - 1];
      render({
        keepId: nextCompleted?.id,
        animate: { id: restored.id, status: "active", type: "restored" }
      });
    } else {
      render({
        keepId: restored.id,
        animate: { id: restored.id, status: "active", type: "restored" }
      });
    }
    return;
  }

  if (status === "deleted") {
    await animateSourceAction(id, "deleted", "restored");
    const index = state.deleted.findIndex(item => item.id === id);
    if (index < 0) return;
    const [item] = state.deleted.splice(index, 1);
    const restored = {
      id: item.id,
      text: item.text,
      createdAt: item.createdAt,
      updatedAt: Date.now()
    };
    state.active.unshift(restored);
    await persistState();
    if (currentView === "deleted") {
      const nextDeleted = state.deleted[index] || state.deleted[index - 1];
      render({
        keepId: nextDeleted?.id,
        animate: { id: restored.id, status: "active", type: "restored" }
      });
    } else {
      render({
        keepId: restored.id,
        animate: { id: restored.id, status: "active", type: "restored" }
      });
    }
  }
}

async function deleteTodo(id, status) {
  const now = Date.now();
  if (status === "active" || status === "completed") {
    await animateSourceAction(id, status, "deleted");
    const source = status === "active" ? state.active : state.completed;
    const index = source.findIndex(item => item.id === id);
    if (index < 0) return;
    const [item] = source.splice(index, 1);
    const deletedItem = {
      id: item.id,
      text: item.text,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt ?? item.createdAt,
      deletedAt: now
    };
    if (item.completedAt) {
      deletedItem.completedAt = item.completedAt;
    }
    state.deleted = state.deleted.filter(entry => entry.id !== deletedItem.id);
    state.deleted.unshift(deletedItem);
    await persistState();
    const next = source[index] || source[index - 1];
    render({
      keepId: next?.id,
      animate: { id: deletedItem.id, status: "deleted", type: "deleted" }
    });
    return;
  }

  if (status === "deleted") {
    const index = state.deleted.findIndex(item => item.id === id);
    if (index < 0) return;
    state.deleted.splice(index, 1);
    await persistState();
    const next = state.deleted[index] || state.deleted[index - 1];
    render({ keepId: next?.id });
  }
}

function animateSourceAction(id, status, type) {
  const className = ACTION_SOURCE_ANIMATION_CLASS_MAP[type];
  if (!className) {
    return Promise.resolve();
  }

  let listEl = activeList;
  if (status === "completed") {
    listEl = completedList;
  } else if (status === "deleted") {
    listEl = deletedList;
  }

  const target = listEl.querySelector(`[data-id="${id}"]`);
  if (!target) {
    return Promise.resolve();
  }

  ACTION_SOURCE_ANIMATION_CLASSES.forEach(name => target.classList.remove(name));
  void target.offsetWidth;
  target.classList.add(className);

  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      target.classList.remove(className);
      resolve();
    };

    target.addEventListener("animationend", cleanup, { once: true });
    target.addEventListener("animationcancel", cleanup, { once: true });
    setTimeout(cleanup, 600);
  });
}

function triggerActionAnimation({ id, status, type }) {
  const className = ACTION_ANIMATION_CLASS_MAP[type];
  if (!className) {
    return;
  }

  let listEl = activeList;
  if (status === "completed") {
    listEl = completedList;
  } else if (status === "deleted") {
    listEl = deletedList;
  }

  const target = listEl.querySelector(`[data-id="${id}"]`);
  if (!target) {
    return;
  }

  ACTION_ANIMATION_CLASSES.forEach(name => target.classList.remove(name));
  // 再適用のためにリフローを挟む
  void target.offsetWidth;

  target.classList.add(className);

  const clearAnimation = () => {
    target.classList.remove(className);
  };

  target.addEventListener("animationend", clearAnimation, { once: true });
  target.addEventListener("animationcancel", clearAnimation, { once: true });
}

function csvEscape(raw) {
  if (raw === null || raw === undefined) return "";
  const value = String(raw);
  if (!/[",\n\r]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function formatTimestampForCsv(ts) {
  if (!Number.isFinite(ts)) return "";
  return formatDate(ts);
}

function buildCsvRows() {
  const rows = [[
    "status",
    "id",
    "text",
    "createdAt",
    "updatedAt",
    "completedAt",
    "deletedAt"
  ]];

  const appendRows = (items, status) => {
    items.forEach(item => {
      rows.push([
        status,
        item.id,
        item.text,
        formatTimestampForCsv(item.createdAt),
        formatTimestampForCsv(item.updatedAt),
        formatTimestampForCsv(item.completedAt),
        formatTimestampForCsv(item.deletedAt)
      ]);
    });
  };

  appendRows(state.active, "active");
  appendRows(state.completed, "completed");
  appendRows(state.deleted, "deleted");

  return rows;
}

function rowsToCsv(rows) {
  return rows.map(row => row.map(csvEscape).join(",")).join("\r\n");
}

function buildExportFilename() {
  const now = new Date();
  const pad = (num) => String(num).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `todo-list-${stamp}.csv`;
}

function exportTodosAsCsv() {
  const rows = buildCsvRows();
  const csvContent = rowsToCsv(rows);
  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = buildExportFilename();
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function deleteAllData() {
  const confirmed = window.confirm("全ての TODO データを削除します。よろしいですか？");
  if (!confirmed) {
    return;
  }
  try {
    await chrome.storage.sync.remove(STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear storage", error);
    window.alert("データの削除に失敗しました。時間を置いて再度お試しください。");
    return;
  }

  state = { active: [], completed: [], deleted: [] };
  selectionIndex = -1;
  displayedItems = [];

  render();
  updateFooterCommands(currentView);
  if (currentView === "todos") {
    focusInput();
  }
}

function switchView(view, options = {}) {
  if (!["todos", "completed", "deleted", "settings"].includes(view)) return;
  if (currentView === view && !options.focusId) {
    updateFooterCommands(view);
    if (view === "todos") focusInput();
    return;
  }
  currentView = view;
  todosView.classList.toggle("active", view === "todos");
  completedView.classList.toggle("active", view === "completed");
  deletedView.classList.toggle("active", view === "deleted");
  settingsView.classList.toggle("active", view === "settings");
  viewTodosBtn.classList.toggle("active", view === "todos");
  viewCompletedBtn.classList.toggle("active", view === "completed");
  viewDeletedBtn.classList.toggle("active", view === "deleted");
  viewSettingsBtn.classList.toggle("active", view === "settings");
  render({ keepId: options.focusId });
  updateFooterCommands(view);
  if (view === "todos") {
    focusInput();
  }
}

function handleArrowNavigation(event) {
  if (displayedItems.length === 0) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSelection(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSelection(-1);
  }
}

async function handleAltShortcut(event) {
  if (event.key === "ArrowUp") {
    event.preventDefault();
    cycleView(-1);
    return true;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    cycleView(1);
    return true;
  }

  const current = getCurrentEntry();
  if (!current) return false;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    if (currentView === "todos") {
      await deleteTodo(current.item.id, "active");
    } else if (currentView === "completed") {
      await deleteTodo(current.item.id, "completed");
    } else if (currentView === "deleted") {
      await deleteTodo(current.item.id, "deleted");
    }
    return true;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    if (currentView === "todos") {
      await completeTodo(current.item.id);
    } else if (currentView === "completed") {
      await restoreTodo(current.item.id, "completed");
    } else if (currentView === "deleted") {
      await restoreTodo(current.item.id, "deleted");
    }
    return true;
  }

  return false;
}

todoInput.addEventListener("compositionstart", () => {
  isComposing = true;
});

todoInput.addEventListener("compositionend", () => {
  isComposing = false;
});

todoInput.addEventListener("keydown", async (event) => {
  if (event.key === "Enter") {
    if (event.isComposing || isComposing) {
      return;
    }
    event.preventDefault();
    await addTodoFromInput();
  } else if (!event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    handleArrowNavigation(event);
  }
});

viewTodosBtn.addEventListener("click", () => switchView("todos"));
viewCompletedBtn.addEventListener("click", () => switchView("completed"));
viewDeletedBtn.addEventListener("click", () => switchView("deleted"));
viewSettingsBtn.addEventListener("click", () => switchView("settings"));
exportCsvBtn.addEventListener("click", () => exportTodosAsCsv());
deleteAllBtn.addEventListener("click", () => {
  deleteAllData();
});

document.addEventListener("keydown", async (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeTodo();
    return;
  }

  if (event.altKey && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
    if (await handleAltShortcut(event)) {
      return;
    }
  }

  if (event.target === todoInput) {
    return;
  }

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    handleArrowNavigation(event);
    return;
  }
});

window.addEventListener("message", (event) => {
  if (event.data?.type === "focusInput") {
    focusInput();
  } else if (event.data?.type === "closeTodo") {
    closeTodo();
  }
});

loadState().then(() => {
  render();
  updateFooterCommands(currentView);
  if (!IS_EMBEDDED) {
    requestAnimationFrame(() => focusInput());
  }
});

document.addEventListener("DOMContentLoaded", () => {
  focusInput();
});
