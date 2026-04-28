const gameTitleEl = document.getElementById("game-title");
const categoriesCountEl = document.getElementById("categories-count");
const matchedCountEl = document.getElementById("matched-count");
const remainingCountEl = document.getElementById("remaining-count");
const mistakesCountEl = document.getElementById("mistakes-count");
const resetPuzzleBtn = document.getElementById("reset-puzzle-btn");
const deselectAllBtn = document.getElementById("deselect-all-btn");
const sharePuzzleBtn = document.getElementById("share-puzzle-btn");
const shareStatus = document.getElementById("share-status");
const gameError = document.getElementById("game-error");
const gameGrid = document.getElementById("game-grid");
const toolbarStatsRow = document.getElementById("toolbar-stats-row");
const winBanner = document.getElementById("win-banner");

const PUZZLE_PROGRESS_PREFIX = "word-match-progress:";
const state = {
  tiles: [],
  selectedTileId: null,
  mistakes: 0,
  totalItems: 0,
  groupTargets: new Map(),
  groupNames: new Map(),
  groupPastels: new Map(),
};

function decodePuzzleFromHash(hash) {
  if (!hash || !hash.startsWith("#data=")) return null;
  try {
    return JSON.parse(decodeURIComponent(atob(hash.slice("#data=".length))));
  } catch {
    return null;
  }
}

function normalizePuzzle(puzzle) {
  if (!puzzle || typeof puzzle !== "object" || !puzzle.groups) throw new Error("Puzzle must include groups.");
  const groups = [];
  const seenItems = new Set();
  const sourceGroups = Array.isArray(puzzle.groups)
    ? puzzle.groups
    : Object.entries(puzzle.groups).map(([name, items]) => ({ name, items }));
  for (const groupEntry of sourceGroups) {
    const groupName = String(groupEntry?.name ?? "").trim();
    const itemsRaw = groupEntry?.items;
    if (!groupName) throw new Error("Group names cannot be empty.");
    if (!Array.isArray(itemsRaw) || itemsRaw.length < 2) throw new Error(`Group "${groupName}" needs at least 2 items.`);
    const items = itemsRaw.map((item) => String(item).trim()).filter(Boolean);
    if (items.length < 2) throw new Error(`Group "${groupName}" needs at least 2 non-empty items.`);
    for (const item of items) {
      const key = item.toLowerCase();
      if (seenItems.has(key)) throw new Error(`Duplicate item found: "${item}".`);
      seenItems.add(key);
    }
    groups.push({ name: groupName, items });
  }
  if (groups.length < 2) throw new Error("At least 2 groups are required.");
  return { title: typeof puzzle.title === "string" ? puzzle.title.trim() : "", groups };
}

function randomPastel() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue} 60% 85%)`;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function puzzleProgressKeyFromHash(hash) {
  if (!hash || !hash.startsWith("#data=")) return null;
  return `${PUZZLE_PROGRESS_PREFIX}${hash.slice("#data=".length)}`;
}

function savePuzzleProgress() {
  const key = puzzleProgressKeyFromHash(window.location.hash);
  if (!key) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        mistakes: state.mistakes,
        tiles: state.tiles,
        groupPastels: Array.from(state.groupPastels.entries()),
      })
    );
  } catch {}
}

function loadPuzzleProgress() {
  const key = puzzleProgressKeyFromHash(window.location.hash);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearPuzzleProgress() {
  const key = puzzleProgressKeyFromHash(window.location.hash);
  if (key) localStorage.removeItem(key);
}

function truncateLabel(items) {
  const total = items.length;
  if (total === 1) return items[0];
  if (total <= 2) return `${items.join(", ")} (${total})`;
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

function isGroupComplete(tile) {
  return tile.items.length === (state.groupTargets.get(tile.groupId) || 0);
}

function isPuzzleSolved() {
  const completedGroups = state.tiles.filter((tile) => isGroupComplete(tile)).length;
  return completedGroups === state.groupTargets.size && state.groupTargets.size > 0;
}

function codeEl(value) {
  const el = document.createElement("code");
  el.textContent = String(value);
  return el;
}

function setStatSpan(el, label, value) {
  el.replaceChildren(document.createTextNode(`${label}: `), codeEl(value));
}

function setSolvedUi(solved) {
  if (!toolbarStatsRow || !winBanner) return;
  if (solved) {
    toolbarStatsRow.classList.add("hidden");
    const totalCategories = state.groupTargets.size;
    const n = totalCategories;
    const m = state.mistakes;
    winBanner.replaceChildren(
      document.createTextNode("Solved! Categories found: "),
      codeEl(n),
      document.createTextNode(" of "),
      codeEl(n),
      document.createTextNode(". Mistakes: "),
      codeEl(m),
      document.createTextNode(".")
    );
    winBanner.classList.remove("hidden");
    deselectAllBtn.disabled = true;
  } else {
    toolbarStatsRow.classList.remove("hidden");
    winBanner.classList.add("hidden");
    winBanner.replaceChildren();
    deselectAllBtn.disabled = false;
  }
}

function updateCategoriesCount() {
  if (!categoriesCountEl) return;
  const n = state.groupTargets.size;
  if (n === 0) {
    categoriesCountEl.replaceChildren(
      document.createTextNode("Create "),
      document.createTextNode("0"),
      document.createTextNode(" groups of "),
      document.createTextNode("0"),
      document.createTextNode(".")
    );
    return;
  }
  const firstGroupSize = state.groupTargets.values().next().value ?? 0;
  categoriesCountEl.replaceChildren(
    document.createTextNode("Create "),
    document.createTextNode(String(n)),
    document.createTextNode(" groups of "),
    document.createTextNode(String(firstGroupSize)),
    document.createTextNode(".")
  );
}

function updateCounters() {
  const remainingSingles = state.tiles.filter((tile) => tile.items.length === 1).length;
  updateCategoriesCount();
  setStatSpan(matchedCountEl, "Matched", state.totalItems - remainingSingles);
  setStatSpan(remainingCountEl, "Remaining", remainingSingles);
  setStatSpan(mistakesCountEl, "Mistakes", state.mistakes);
  setSolvedUi(isPuzzleSolved());
}

function renderGame() {
  gameGrid.innerHTML = "";
  const rowSize = Math.max(2, Math.ceil(Math.sqrt(Math.max(state.tiles.length, 1))));
  let currentRow = null;

  state.tiles.forEach((tile, index) => {
    if (index % rowSize === 0) {
      currentRow = document.createElement("div");
      currentRow.className = "game-row";
      gameGrid.appendChild(currentRow);
    }

    const wrap = document.createElement("div");
    wrap.className = "game-tile-wrap";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "game-tile";
    const target = state.groupTargets.get(tile.groupId) || 0;
    if (tile.items.length > 1) btn.classList.add("merged");
    if (tile.items.length > 1 && tile.items.length < target) btn.classList.add("in-progress");
    if (state.selectedTileId === tile.id) btn.classList.add("selected");
    if (isGroupComplete(tile)) {
      btn.classList.add("complete");
      btn.style.background = state.groupPastels.get(tile.groupId);
    }
    btn.textContent = getTileLabel(tile);
    btn.addEventListener("click", () => onTileClick(tile.id));

    wrap.appendChild(btn);

    if (tile.items.length > 2) {
      wrap.classList.add("has-hover-preview");
      const hover = document.createElement("div");
      hover.className = "game-tile-hover";
      hover.textContent = tile.items.join(", ");
      wrap.appendChild(hover);
    }

    currentRow.appendChild(wrap);
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
  if (!clickedTile) return;
  if (!state.selectedTileId) {
    state.selectedTileId = clickedId;
    return renderGame();
  }
  if (state.selectedTileId === clickedId) return clearSelection();
  const firstIndex = state.tiles.findIndex((tile) => tile.id === state.selectedTileId);
  const secondIndex = state.tiles.findIndex((tile) => tile.id === clickedId);
  if (firstIndex < 0 || secondIndex < 0) return clearSelection();
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

function setupGame(puzzle) {
  state.tiles = [];
  state.selectedTileId = null;
  state.mistakes = 0;
  state.groupTargets = new Map();
  state.groupNames = new Map();
  state.groupPastels = new Map();
  state.totalItems = 0;
  gameError.textContent = "";
  setSolvedUi(false);
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
      .filter((tile) => tile.id && state.groupTargets.has(tile.groupId) && tile.items.length >= 1);
    if (state.tiles.length === 0) state.tiles = shuffle(seedTiles);
    state.mistakes = saved.mistakes;
    if (Array.isArray(saved.groupPastels)) {
      saved.groupPastels.forEach(([groupId, color]) => {
        if (state.groupPastels.has(groupId) && typeof color === "string") state.groupPastels.set(groupId, color);
      });
    }
  }
  gameTitleEl.textContent = puzzle.title || "Word Match";
  renderGame();
}

function restartCurrentPuzzle() {
  const puzzle = decodePuzzleFromHash(window.location.hash);
  if (!puzzle) return;
  try {
    clearPuzzleProgress();
    setupGame(normalizePuzzle(puzzle));
    shareStatus.textContent = "";
  } catch {}
}

sharePuzzleBtn.addEventListener("click", async () => {
  shareStatus.textContent = "";
  if (!window.location.hash.startsWith("#data=")) return;
  try {
    await navigator.clipboard.writeText(window.location.href);
    shareStatus.textContent = "Copied.";
    window.setTimeout(() => {
      if (shareStatus.textContent === "Copied.") shareStatus.textContent = "";
    }, 1200);
  } catch {
    shareStatus.textContent = "Copy failed.";
  }
});

resetPuzzleBtn.addEventListener("click", restartCurrentPuzzle);

deselectAllBtn.addEventListener("click", clearSelection);

const puzzle = decodePuzzleFromHash(window.location.hash);
if (!puzzle) {
  gameError.textContent = "Missing puzzle data in URL.";
  updateCategoriesCount();
} else {
  try {
    setupGame(normalizePuzzle(puzzle));
  } catch (err) {
    gameError.textContent = err.message;
    updateCategoriesCount();
  }
}
