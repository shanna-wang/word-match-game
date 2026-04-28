const builderView = document.getElementById("builder-view");
const playView = document.getElementById("play-view");

const groupFormContainer = document.getElementById("group-form-container");
const generateLinkBtn = document.getElementById("generate-link-btn");
const clearDraftBtn = document.getElementById("clear-draft-btn");
const builderError = document.getElementById("builder-error");

const gameTitleEl = document.getElementById("game-title");
const matchedCountEl = document.getElementById("matched-count");
const remainingCountEl = document.getElementById("remaining-count");
const mistakesCountEl = document.getElementById("mistakes-count");
const resetPuzzleBtn = document.getElementById("reset-puzzle-btn");
const deselectAllBtn = document.getElementById("deselect-all-btn");
const sharePuzzleBtn = document.getElementById("share-puzzle-btn");
const shareStatus = document.getElementById("share-status");
const gameError = document.getElementById("game-error");
const gameGrid = document.getElementById("game-grid");
const winBanner = document.getElementById("win-banner");
const winMistakes = document.getElementById("win-mistakes");

const state = {
  tiles: [],
  selectedTileId: null,
  mistakes: 0,
  totalItems: 0,
  groupTargets: new Map(),
  groupNames: new Map(),
  groupPastels: new Map(),
};

const builderState = {
  groups: [{ name: "", items: ["", "", "", ""] }],
  itemCount: 4,
};
const BUILDER_DRAFT_KEY = "word-match-builder-draft-v1";
const PUZZLE_PROGRESS_PREFIX = "word-match-progress:";

function saveBuilderDraft() {
  const draft = {
    builderState,
  };
  try {
    localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage failures (private mode or quota).
  }
}

function loadBuilderDraft() {
  try {
    const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (
      parsed.builderState &&
      Array.isArray(parsed.builderState.groups) &&
      Number.isInteger(parsed.builderState.itemCount) &&
      parsed.builderState.itemCount >= 2
    ) {
      builderState.itemCount = parsed.builderState.itemCount;
      builderState.groups = parsed.builderState.groups
        .map((group) => ({
          name: typeof group.name === "string" ? group.name : "",
          items: Array.isArray(group.items) ? group.items.map((item) => String(item ?? "")) : [],
        }))
        .filter((group) => group.name !== "" || group.items.some((item) => item.trim() !== ""));
      if (builderState.groups.length === 0) {
        builderState.groups = [{ name: "", items: Array.from({ length: builderState.itemCount }, () => "") }];
      }
      syncAllGroupsToItemCount();
    }
  } catch {
    // Ignore malformed drafts.
  }
}

function clearBuilderDraft() {
  localStorage.removeItem(BUILDER_DRAFT_KEY);
  builderState.itemCount = 4;
  builderState.groups = [{ name: "", items: ["", "", "", ""] }];
  builderError.textContent = "";
  renderBuilderForm();
}

function encodePuzzleToHash(puzzle) {
  const encoded = btoa(encodeURIComponent(JSON.stringify(puzzle)));
  return `#data=${encoded}`;
}

function decodePuzzleFromHash(hash) {
  if (!hash || !hash.startsWith("#data=")) {
    return null;
  }
  try {
    const payload = hash.slice("#data=".length);
    const json = decodeURIComponent(atob(payload));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function puzzleProgressKeyFromHash(hash) {
  if (!hash || !hash.startsWith("#data=")) {
    return null;
  }
  return `${PUZZLE_PROGRESS_PREFIX}${hash.slice("#data=".length)}`;
}

function savePuzzleProgress() {
  const key = puzzleProgressKeyFromHash(window.location.hash);
  if (!key) {
    return;
  }
  const payload = {
    mistakes: state.mistakes,
    tiles: state.tiles,
    groupPastels: Array.from(state.groupPastels.entries()),
  };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore storage failures.
  }
}

function loadPuzzleProgress() {
  const key = puzzleProgressKeyFromHash(window.location.hash);
  if (!key) {
    return null;
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearPuzzleProgress() {
  const key = puzzleProgressKeyFromHash(window.location.hash);
  if (!key) {
    return;
  }
  localStorage.removeItem(key);
}

function normalizePuzzle(puzzle) {
  if (!puzzle || typeof puzzle !== "object" || !puzzle.groups) {
    throw new Error("Puzzle must include groups.");
  }

  const groups = [];
  const seenItems = new Set();

  const sourceGroups = Array.isArray(puzzle.groups)
    ? puzzle.groups
    : Object.entries(puzzle.groups).map(([name, items]) => ({ name, items }));

  for (const groupEntry of sourceGroups) {
    const groupName = String(groupEntry?.name ?? "").trim();
    const itemsRaw = groupEntry?.items;
    if (!groupName) {
      throw new Error("Group names cannot be empty.");
    }
    if (!Array.isArray(itemsRaw) || itemsRaw.length < 2) {
      throw new Error(`Group "${groupName}" needs at least 2 items.`);
    }

    const items = itemsRaw.map((item) => String(item).trim()).filter(Boolean);
    if (items.length < 2) {
      throw new Error(`Group "${groupName}" needs at least 2 non-empty items.`);
    }

    for (const item of items) {
      const key = item.toLowerCase();
      if (seenItems.has(key)) {
        throw new Error(`Duplicate item found: "${item}".`);
      }
      seenItems.add(key);
    }

    groups.push({ name: groupName, items });
  }

  if (groups.length < 2) {
    throw new Error("At least 2 groups are required.");
  }

  return {
    title: typeof puzzle.title === "string" ? puzzle.title.trim() : "",
    groups,
  };
}

function collectPuzzleFromForm() {
  const groups = {};
  const usedNames = new Set();

  builderState.groups.forEach((group, index) => {
    const rawName = group.name.trim();
    let resolvedName = rawName || `Group ${index + 1}`;
    let suffix = 2;
    while (usedNames.has(resolvedName.toLowerCase())) {
      resolvedName = `${rawName || `Group ${index + 1}`} (${suffix})`;
      suffix += 1;
    }
    usedNames.add(resolvedName.toLowerCase());
    groups[resolvedName] = group.items.map((item) => item.trim()).filter(Boolean);
  });

  return normalizePuzzle({
    title: "",
    groups,
  });
}

function syncAllGroupsToItemCount() {
  builderState.groups.forEach((group) => {
    while (group.items.length < builderState.itemCount) {
      group.items.push("");
    }
    if (group.items.length > builderState.itemCount) {
      group.items.length = builderState.itemCount;
    }
  });
}

function addItemToAllGroups() {
  builderState.itemCount += 1;
  syncAllGroupsToItemCount();
  saveBuilderDraft();
}

function addGroup() {
  builderState.groups.push({
    name: "",
    items: Array.from({ length: builderState.itemCount }, () => ""),
  });
  saveBuilderDraft();
}

function removeLastItemFromAllGroups() {
  if (builderState.itemCount <= 1) {
    return;
  }
  builderState.groups.forEach((group) => {
    group.items.pop();
  });
  builderState.itemCount -= 1;
  saveBuilderDraft();
}

function allVisibleItemsFilled(groupIndex) {
  return builderState.groups[groupIndex].items.every((value) => value.trim() !== "");
}

function focusField(groupIndex, fieldIndex) {
  const field = groupFormContainer.querySelector(
    `[data-group-index="${groupIndex}"][data-field-index="${fieldIndex}"]`
  );
  if (field) {
    field.focus();
  }
}

function handleBuilderEnter(groupIndex, fieldIndex, event) {
  if (event.key !== "Enter") {
    return;
  }
  event.preventDefault();

  const nextField = groupFormContainer.querySelector(
    `[data-group-index="${groupIndex}"][data-field-index="${fieldIndex + 1}"]`
  );
  if (nextField) {
    nextField.focus();
    return;
  }

  addItemToAllGroups();
  renderBuilderForm({ focusGroup: groupIndex, focusField: builderState.itemCount });
}

function handleBuilderTab(groupIndex, event) {
  if (event.key !== "Tab") {
    return;
  }
  event.preventDefault();
  addGroup();
  renderBuilderForm({ focusGroup: builderState.groups.length - 1, focusField: 0 });
}

function removeItemAtIndex(itemIndex) {
  if (builderState.itemCount <= 2) {
    return false;
  }

  builderState.groups.forEach((group) => {
    if (itemIndex >= 0 && itemIndex < group.items.length) {
      group.items.splice(itemIndex, 1);
    }
  });
  builderState.itemCount -= 1;
  saveBuilderDraft();
  return true;
}

function filledItemCount(group) {
  return group.items.reduce((count, item) => count + (item.trim() !== "" ? 1 : 0), 0);
}

function canRemoveItemAtIndex(groupIndex, itemIndex) {
  if (builderState.itemCount <= 2) {
    return false;
  }

  const currentGroup = builderState.groups[groupIndex];
  if (!currentGroup) {
    return false;
  }

  const currentFilled = filledItemCount(currentGroup);
  const otherGroupHasMoreFilled = builderState.groups.some(
    (group, idx) => idx !== groupIndex && filledItemCount(group) > currentFilled
  );
  if (otherGroupHasMoreFilled) {
    return false;
  }

  const targetIndexEmptyInAllGroups = builderState.groups.every((group) => {
    const value = group.items[itemIndex] ?? "";
    return value.trim() === "";
  });

  return targetIndexEmptyInAllGroups;
}

function ensureItemCount(requiredCount) {
  if (requiredCount <= builderState.itemCount) {
    return;
  }
  builderState.itemCount = requiredCount;
  syncAllGroupsToItemCount();
}

function parsePastedItems(rawText) {
  const text = String(rawText ?? "").trim();
  if (!text) {
    return [];
  }
  if (text.includes(",")) {
    return text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return text
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function renderBuilderForm(options = {}) {
  syncAllGroupsToItemCount();
  groupFormContainer.innerHTML = "";
  const row = document.createElement("div");
  row.className = "builder-groups-row";

  builderState.groups.forEach((group, groupIndex) => {
    const card = document.createElement("div");
    card.className = "group-card";

    const heading = document.createElement("h3");
    heading.className = "group-card-number";
    heading.textContent = `${groupIndex + 1}.`;
    card.appendChild(heading);

    const nameWrap = document.createElement("div");
    nameWrap.className = "group-title-wrap";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "group-name-input";
    nameInput.placeholder = `Group ${groupIndex + 1} Name`;
    nameInput.setAttribute("aria-label", `Group ${groupIndex + 1} title`);
    nameInput.value = group.name;
    nameInput.dataset.groupIndex = String(groupIndex);
    nameInput.dataset.fieldIndex = "0";
    nameInput.addEventListener("input", (event) => {
      builderState.groups[groupIndex].name = event.target.value;
      saveBuilderDraft();
    });
    nameInput.addEventListener("keydown", (event) => handleBuilderTab(groupIndex, event));
    nameInput.addEventListener("keydown", (event) => handleBuilderEnter(groupIndex, 0, event));
    nameWrap.appendChild(nameInput);
    card.appendChild(nameWrap);

    const itemsWrap = document.createElement("div");
    itemsWrap.className = "group-items";

    group.items.forEach((itemValue, itemIndex) => {
      const itemWrap = document.createElement("div");
      itemWrap.className = "item-row";
      const itemNumber = document.createElement("span");
      itemNumber.className = "item-number";
      itemNumber.textContent = `${itemIndex + 1}.`;
      const itemInput = document.createElement("input");
      itemInput.type = "text";
      itemInput.className = "item-input";
      itemInput.placeholder = `Item ${itemIndex + 1}`;
      itemInput.setAttribute("aria-label", `Group ${groupIndex + 1} item ${itemIndex + 1}`);
      itemInput.value = itemValue;
      itemInput.dataset.groupIndex = String(groupIndex);
      itemInput.dataset.fieldIndex = String(itemIndex + 1);
      itemInput.addEventListener("input", (event) => {
        builderState.groups[groupIndex].items[itemIndex] = event.target.value;
        saveBuilderDraft();
      });
      itemInput.addEventListener("keydown", (event) =>
        handleBuilderEnter(groupIndex, itemIndex + 1, event)
      );
      itemInput.addEventListener("keydown", (event) => handleBuilderTab(groupIndex, event));
      itemInput.addEventListener("keydown", (event) => {
        if (event.key !== "Backspace") {
          return;
        }
        if (event.target.value.trim() !== "") {
          return;
        }
        if (!canRemoveItemAtIndex(groupIndex, itemIndex)) {
          return;
        }

        event.preventDefault();
        const removed = removeItemAtIndex(itemIndex);
        if (!removed) {
          return;
        }

        const nextField = Math.min(itemIndex + 1, builderState.itemCount);
        renderBuilderForm({ focusGroup: groupIndex, focusField: nextField });
      });
      itemInput.addEventListener("paste", (event) => {
        const rawText = event.clipboardData?.getData("text") ?? "";
        const parsedItems = parsePastedItems(rawText);
        if (parsedItems.length === 0) {
          return;
        }

        event.preventDefault();
        const requiredCount = itemIndex + parsedItems.length;
        ensureItemCount(requiredCount);

        parsedItems.forEach((value, offset) => {
          builderState.groups[groupIndex].items[itemIndex + offset] = value;
        });

        saveBuilderDraft();
        renderBuilderForm({
          focusGroup: groupIndex,
          focusField: itemIndex + parsedItems.length,
        });
      });
      itemWrap.appendChild(itemNumber);
      itemWrap.appendChild(itemInput);
      itemsWrap.appendChild(itemWrap);
    });

    card.appendChild(itemsWrap);

    const itemActions = document.createElement("div");
    itemActions.className = "item-actions";

    const addItemBtn = document.createElement("button");
    addItemBtn.type = "button";
    addItemBtn.className = "item-link-btn";
    addItemBtn.textContent = "Add item";
    addItemBtn.setAttribute("aria-label", `Add item to all groups from group ${groupIndex + 1}`);
    addItemBtn.addEventListener("click", () => {
      addItemToAllGroups();
      renderBuilderForm({ focusGroup: groupIndex, focusField: builderState.itemCount });
    });

    const removeItemBtn = document.createElement("button");
    removeItemBtn.type = "button";
    removeItemBtn.className = "item-link-btn";
    removeItemBtn.textContent = "Remove item";
    removeItemBtn.setAttribute("aria-label", `Remove last item from all groups from group ${groupIndex + 1}`);
    removeItemBtn.addEventListener("click", () => {
      removeLastItemFromAllGroups();
      renderBuilderForm({ focusGroup: groupIndex, focusField: Math.max(1, builderState.itemCount) });
    });

    itemActions.appendChild(addItemBtn);
    itemActions.appendChild(removeItemBtn);
    card.appendChild(itemActions);

    row.appendChild(card);
  });

  const addGroupCard = document.createElement("button");
  addGroupCard.type = "button";
  addGroupCard.className = "add-group-card";
  addGroupCard.setAttribute("aria-label", "Add group");
  addGroupCard.innerHTML = '<span class="add-group-symbol">Press tab to add group</span>';
  addGroupCard.addEventListener("click", () => {
    addGroup();
    renderBuilderForm({ focusGroup: builderState.groups.length - 1, focusField: 0 });
  });
  row.appendChild(addGroupCard);

  groupFormContainer.appendChild(row);

  if (typeof options.focusGroup === "number" && typeof options.focusField === "number") {
    focusField(options.focusGroup, options.focusField);
  }
}

function randomPastel() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue} 60% 85%)`;
}

function truncateLabel(items) {
  const total = items.length;
  if (total === 1) {
    return items[0];
  }
  if (total <= 2) {
    return `${items.join(", ")} (${total})`;
  }
  return `${items.slice(0, 2).join(", ")}, … (${total})`;
}

function getTileLabel(tile) {
  const total = tile.items.length;
  const target = state.groupTargets.get(tile.groupId) || 0;
  if (target > 0 && total >= target) {
    const groupName = (state.groupNames.get(tile.groupId) || "").toUpperCase();
    return `${groupName} (${total})`;
  }
  return truncateLabel(tile.items);
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function setupGame(puzzle) {
  state.tiles = [];
  state.selectedTileId = null;
  state.mistakes = 0;
  state.groupTargets = new Map();
  state.groupNames = new Map();
  state.groupPastels = new Map();
  state.totalItems = 0;
  gameError.textContent = "";
  winBanner.classList.add("hidden");

  const seedTiles = [];
  puzzle.groups.forEach((group, idx) => {
    const groupId = `g-${idx}`;
    state.groupTargets.set(groupId, group.items.length);
    state.groupNames.set(groupId, group.name);
    state.groupPastels.set(groupId, randomPastel());
    state.totalItems += group.items.length;
    group.items.forEach((item, itemIndex) => {
      seedTiles.push({
        id: `${groupId}-${itemIndex}-${Math.random().toString(36).slice(2, 8)}`,
        groupId,
        items: [item],
      });
    });
  });

  state.tiles = shuffle(seedTiles);
  const saved = loadPuzzleProgress();
  if (saved && Array.isArray(saved.tiles) && Number.isFinite(saved.mistakes)) {
    state.tiles = saved.tiles
      .map((tile) => ({
        id: String(tile?.id ?? ""),
        groupId: String(tile?.groupId ?? ""),
        items: Array.isArray(tile?.items) ? tile.items.map((item) => String(item ?? "")) : [],
      }))
      .filter(
        (tile) =>
          tile.id &&
          tile.groupId &&
          state.groupTargets.has(tile.groupId) &&
          tile.items.length >= 1
      );
    if (state.tiles.length === 0) {
      state.tiles = shuffle(seedTiles);
    }
    state.mistakes = saved.mistakes;
    if (Array.isArray(saved.groupPastels)) {
      saved.groupPastels.forEach(([groupId, color]) => {
        if (state.groupPastels.has(groupId) && typeof color === "string") {
          state.groupPastels.set(groupId, color);
        }
      });
    }
  }
  gameTitleEl.textContent = puzzle.title || "Word Match";
  renderGame();
}

function isGroupComplete(tile) {
  const target = state.groupTargets.get(tile.groupId) || 0;
  return tile.items.length === target;
}

function updateCounters() {
  const remainingSingles = state.tiles.filter((tile) => tile.items.length === 1).length;
  const matched = state.totalItems - remainingSingles;
  const remaining = remainingSingles;
  matchedCountEl.textContent = `Matched: ${matched}`;
  remainingCountEl.textContent = `Remaining: ${remaining}`;
  mistakesCountEl.textContent = `Mistakes: ${state.mistakes}`;

  const completedGroups = state.tiles.filter((tile) => isGroupComplete(tile)).length;
  if (completedGroups === state.groupTargets.size && state.groupTargets.size > 0) {
    winMistakes.textContent = `Mistakes: ${state.mistakes}`;
    winBanner.classList.remove("hidden");
  } else {
    winBanner.classList.add("hidden");
  }
}

function renderGame() {
  const cols = Math.max(2, Math.ceil(Math.sqrt(Math.max(state.tiles.length, 1))));
  gameGrid.style.gridTemplateColumns = `repeat(${cols}, max-content)`;
  gameGrid.innerHTML = "";

  state.tiles.forEach((tile) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "game-tile";
    const target = state.groupTargets.get(tile.groupId) || 0;
    if (tile.items.length > 1) {
      btn.classList.add("merged");
    }
    if (tile.items.length > 1 && tile.items.length < target) {
      btn.classList.add("in-progress");
    }
    if (state.selectedTileId === tile.id) {
      btn.classList.add("selected");
    }
    if (isGroupComplete(tile)) {
      btn.classList.add("complete");
      btn.style.background = state.groupPastels.get(tile.groupId);
    }
    btn.title = tile.items.join(", ");
    btn.textContent = getTileLabel(tile);
    btn.addEventListener("click", () => onTileClick(tile.id));
    gameGrid.appendChild(btn);
  });

  updateCounters();
  savePuzzleProgress();
}

function clearSelection() {
  state.selectedTileId = null;
  renderGame();
}

function onTileClick(clickedId) {
  const clickedTile = state.tiles.find((tile) => tile.id === clickedId);
  if (!clickedTile) {
    return;
  }

  if (!state.selectedTileId) {
    state.selectedTileId = clickedId;
    renderGame();
    return;
  }

  if (state.selectedTileId === clickedId) {
    clearSelection();
    return;
  }

  const firstIndex = state.tiles.findIndex((tile) => tile.id === state.selectedTileId);
  const secondIndex = state.tiles.findIndex((tile) => tile.id === clickedId);
  if (firstIndex < 0 || secondIndex < 0) {
    clearSelection();
    return;
  }

  const first = state.tiles[firstIndex];
  const second = state.tiles[secondIndex];

  if (first.groupId === second.groupId) {
    second.items = [...second.items, ...first.items];
    state.tiles.splice(firstIndex, 1);
  } else {
    state.mistakes += 1;
  }

  state.selectedTileId = null;
  renderGame();
}

function getPuzzleFromInputs() {
  return collectPuzzleFromForm();
}

function showBuilder() {
  builderView.classList.remove("hidden");
  playView.classList.add("hidden");
}

function showPlay() {
  builderView.classList.add("hidden");
  playView.classList.remove("hidden");
}

function routeByHash() {
  const puzzle = decodePuzzleFromHash(window.location.hash);
  if (!puzzle) {
    showBuilder();
    shareStatus.textContent = "";
    return;
  }

  try {
    const normalized = normalizePuzzle(puzzle);
    showPlay();
    shareStatus.textContent = "";
    setupGame(normalized);
  } catch (err) {
    showPlay();
    gameError.textContent = err.message;
  }
}

generateLinkBtn.addEventListener("click", () => {
  builderError.textContent = "";
  try {
    const puzzle = getPuzzleFromInputs();
    const url = `${window.location.origin}${window.location.pathname}${encodePuzzleToHash(puzzle)}`;
    const newTab = window.open(url, "_blank", "noopener,noreferrer");
    if (!newTab) {
      builderError.textContent = "Popup blocked. Please allow popups for this site.";
    }
  } catch (err) {
    builderError.textContent = err.message;
  }
});

clearDraftBtn.addEventListener("click", clearBuilderDraft);
sharePuzzleBtn.addEventListener("click", async () => {
  shareStatus.textContent = "";
  if (!window.location.hash.startsWith("#data=")) {
    return;
  }
  try {
    await navigator.clipboard.writeText(window.location.href);
    shareStatus.textContent = "Copied.";
    window.setTimeout(() => {
      if (shareStatus.textContent === "Copied.") {
        shareStatus.textContent = "";
      }
    }, 1200);
  } catch {
    shareStatus.textContent = "Copy failed.";
  }
});

resetPuzzleBtn.addEventListener("click", () => {
  const puzzle = decodePuzzleFromHash(window.location.hash);
  if (!puzzle) {
    return;
  }
  try {
    const normalized = normalizePuzzle(puzzle);
    clearPuzzleProgress();
    setupGame(normalized);
    shareStatus.textContent = "";
  } catch {
    // Ignore malformed hash.
  }
});

deselectAllBtn.addEventListener("click", clearSelection);

window.addEventListener("hashchange", routeByHash);

if (!decodePuzzleFromHash(window.location.hash)) {
  loadBuilderDraft();
}
renderBuilderForm();
routeByHash();
