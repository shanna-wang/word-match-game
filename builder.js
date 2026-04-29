const groupFormContainer = document.getElementById("group-form-container");
const generateLinkBtn = document.getElementById("generate-link-btn");
const exportJsonBtn = document.getElementById("export-json-btn");
const importJsonBtn = document.getElementById("import-json-btn");
const importJsonInput = document.getElementById("import-json-input");
const clearDraftBtn = document.getElementById("clear-draft-btn");
const builderSummary = document.getElementById("builder-summary");
const builderError = document.getElementById("builder-error");
const summaryGroupsCount = document.getElementById("summary-groups-count");
const summaryItemsCount = document.getElementById("summary-items-count");
const summaryTotalItemsCount = document.getElementById("summary-total-items-count");

const builderState = {
  groups: [{ name: "", items: ["", "", "", ""] }],
  itemCount: 4,
};
const BUILDER_DRAFT_KEY = "word-match-builder-draft-v1";

function saveBuilderDraft() {
  try {
    localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify({ builderState }));
  } catch {}
}

function loadBuilderDraft() {
  try {
    const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
    if (!raw) return;
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
  } catch {}
}

function clearBuilderDraft() {
  localStorage.removeItem(BUILDER_DRAFT_KEY);
  builderState.itemCount = 4;
  builderState.groups = [{ name: "", items: ["", "", "", ""] }];
  renderBuilderForm();
}

function applyPuzzleToBuilder(puzzle) {
  const normalized = normalizePuzzle(puzzle);
  const groups = normalized.groups.map((group) => ({
    name: group.name,
    items: [...group.items],
  }));
  const nextItemCount = Math.max(2, ...groups.map((group) => group.items.length));
  builderState.itemCount = nextItemCount;
  builderState.groups = groups;
  syncAllGroupsToItemCount();
  saveBuilderDraft();
  renderBuilderForm({ focusGroup: 0, focusField: 0 });
}

function encodePuzzleToHash(puzzle) {
  return `#data=${btoa(encodeURIComponent(JSON.stringify(puzzle)))}`;
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
    if (!groupName) throw new Error("Group names cannot be empty.");
    if (!Array.isArray(itemsRaw) || itemsRaw.length < 2) {
      throw new Error(`Group "${groupName}" needs at least 2 items.`);
    }
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
  return { title: "", groups };
}

function collectPuzzleFromForm() {
  const filledCounts = builderState.groups.map((group) => filledItemCount(group));
  const expectedFilledCount = filledCounts[0] ?? 0;
  if (filledCounts.some((count) => count !== expectedFilledCount)) {
    throw new Error("Each group must have the same number of filled items.");
  }
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
  return normalizePuzzle({ title: "", groups });
}

function getBuilderValidationState() {
  const groupCount = builderState.groups.length;
  const filledCounts = builderState.groups.map((group) => filledItemCount(group));
  const expectedFilledCount = filledCounts[0] ?? 0;
  const countsMatch = filledCounts.every((count) => count === expectedFilledCount);
  const totalFilledAcrossAllGroups = filledCounts.reduce((sum, n) => sum + n, 0);
  const totalItemsWhenBalanced = groupCount * expectedFilledCount;
  const totalItems = countsMatch ? totalItemsWhenBalanced : totalFilledAcrossAllGroups;

  if (groupCount < 2) {
    return {
      canGenerate: false,
      message: "At least 2 groups are required.",
      groupCount,
      itemsPerGroup: expectedFilledCount,
      totalItems,
    };
  }

  if (!countsMatch) {
    return {
      canGenerate: false,
      message: "Each group must have the same number of filled items.",
      groupCount,
      itemsPerGroup: null,
      totalItems,
    };
  }

  if (expectedFilledCount < 2) {
    return {
      canGenerate: false,
      message: "Each group needs at least 2 non-empty items.",
      groupCount,
      itemsPerGroup: expectedFilledCount,
      totalItems,
    };
  }

  try {
    collectPuzzleFromForm();
    return {
      canGenerate: true,
      message: "",
      groupCount,
      itemsPerGroup: expectedFilledCount,
      totalItems,
    };
  } catch (err) {
    return {
      canGenerate: false,
      message: err.message || "Puzzle is not ready yet.",
      groupCount,
      itemsPerGroup: expectedFilledCount,
      totalItems,
    };
  }
}

function updateBuilderStatus(options = {}) {
  const validation = getBuilderValidationState();
  const message = Object.prototype.hasOwnProperty.call(options, "forceMessage")
    ? options.forceMessage
    : validation.message;
  if (summaryGroupsCount) summaryGroupsCount.textContent = String(validation.groupCount);
  if (summaryItemsCount) summaryItemsCount.textContent = String(validation.itemsPerGroup ?? 0);
  if (summaryTotalItemsCount) summaryTotalItemsCount.textContent = String(validation.totalItems ?? 0);
  generateLinkBtn.disabled = !validation.canGenerate;
  if (!builderSummary || !builderError) return;
  if (message) {
    builderSummary.classList.add("hidden");
    builderError.classList.remove("hidden");
    builderError.textContent = message;
  } else {
    builderError.textContent = "";
    builderError.classList.add("hidden");
    builderSummary.classList.remove("hidden");
  }
}

function syncAllGroupsToItemCount() {
  builderState.groups.forEach((group) => {
    while (group.items.length < builderState.itemCount) group.items.push("");
    if (group.items.length > builderState.itemCount) group.items.length = builderState.itemCount;
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

function removeGroup(groupIndex) {
  if (builderState.groups.length <= 1) return;
  if (groupIndex < 0 || groupIndex >= builderState.groups.length) return;
  builderState.groups.splice(groupIndex, 1);
  saveBuilderDraft();
}

function removeLastItemFromAllGroups() {
  if (builderState.itemCount <= 1) return;
  builderState.groups.forEach((group) => group.items.pop());
  builderState.itemCount -= 1;
  saveBuilderDraft();
}

function focusField(groupIndex, fieldIndex) {
  const field = groupFormContainer.querySelector(
    `[data-group-index="${groupIndex}"][data-field-index="${fieldIndex}"]`
  );
  if (field) field.focus();
}

function handleBuilderEnter(groupIndex, fieldIndex, event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const nextField = groupFormContainer.querySelector(
    `[data-group-index="${groupIndex}"][data-field-index="${fieldIndex + 1}"]`
  );
  if (nextField) return nextField.focus();
  addItemToAllGroups();
  renderBuilderForm({ focusGroup: groupIndex, focusField: builderState.itemCount });
}

function handleTabToAddGroup(event) {
  if (event.key !== "Tab" || event.shiftKey) return;
  event.preventDefault();
  addGroup();
  renderBuilderForm({ focusGroup: builderState.groups.length - 1, focusField: 0 });
}

function removeItemAtIndex(itemIndex) {
  if (builderState.itemCount <= 2) return false;
  builderState.groups.forEach((group) => {
    if (itemIndex >= 0 && itemIndex < group.items.length) group.items.splice(itemIndex, 1);
  });
  builderState.itemCount -= 1;
  saveBuilderDraft();
  return true;
}

function filledItemCount(group) {
  return group.items.reduce((count, item) => count + (item.trim() !== "" ? 1 : 0), 0);
}

function canRemoveItemAtIndex(groupIndex, itemIndex) {
  if (builderState.itemCount <= 2) return false;
  const currentGroup = builderState.groups[groupIndex];
  if (!currentGroup) return false;
  const currentFilled = filledItemCount(currentGroup);
  const otherGroupHasMoreFilled = builderState.groups.some(
    (group, idx) => idx !== groupIndex && filledItemCount(group) > currentFilled
  );
  if (otherGroupHasMoreFilled) return false;
  return builderState.groups.every((group) => (group.items[itemIndex] ?? "").trim() === "");
}

function ensureItemCount(requiredCount) {
  if (requiredCount <= builderState.itemCount) return;
  builderState.itemCount = requiredCount;
  syncAllGroupsToItemCount();
}

function parsePastedItems(rawText) {
  const text = String(rawText ?? "").trim();
  if (!text) return [];
  if (text.includes(",")) return text.split(",").map((part) => part.trim()).filter(Boolean);
  return text.split(/\s+/).map((part) => part.trim()).filter(Boolean);
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
      updateBuilderStatus();
    });
    nameInput.addEventListener("keydown", handleTabToAddGroup);
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
        updateBuilderStatus();
      });
      itemInput.addEventListener("keydown", (event) => handleBuilderEnter(groupIndex, itemIndex + 1, event));
      if (itemIndex === group.items.length - 1) {
        itemInput.addEventListener("keydown", handleTabToAddGroup);
      }
      itemInput.addEventListener("keydown", (event) => {
        if (event.key !== "Backspace") return;
        if (event.target.value.trim() !== "") return;
        if (!canRemoveItemAtIndex(groupIndex, itemIndex)) return;
        event.preventDefault();
        const removed = removeItemAtIndex(itemIndex);
        if (!removed) return;
        const nextField = Math.min(itemIndex + 1, builderState.itemCount);
        renderBuilderForm({ focusGroup: groupIndex, focusField: nextField });
      });
      itemInput.addEventListener("paste", (event) => {
        const parsedItems = parsePastedItems(event.clipboardData?.getData("text") ?? "");
        if (parsedItems.length === 0) return;
        event.preventDefault();
        const requiredCount = itemIndex + parsedItems.length;
        ensureItemCount(requiredCount);
        parsedItems.forEach((value, offset) => {
          builderState.groups[groupIndex].items[itemIndex + offset] = value;
        });
        saveBuilderDraft();
        renderBuilderForm({ focusGroup: groupIndex, focusField: itemIndex + parsedItems.length });
      });
      itemWrap.appendChild(itemNumber);
      itemWrap.appendChild(itemInput);
      itemsWrap.appendChild(itemWrap);
    });

    card.appendChild(itemsWrap);

    const itemActions = document.createElement("div");
    itemActions.className = "item-actions";
    const itemActionsDivider = document.createElement("div");
    itemActionsDivider.className = "item-actions-divider";
    itemActionsDivider.setAttribute("aria-hidden", "true");
    const addItemRow = document.createElement("div");
    addItemRow.className = "item-actions-add-row";
    const addItemBtn = document.createElement("button");
    addItemBtn.type = "button";
    addItemBtn.className = "item-link-btn";
    addItemBtn.textContent = "+ Item";
    addItemBtn.setAttribute("aria-label", "Add item to all groups");
    addItemBtn.addEventListener("click", () => {
      addItemToAllGroups();
      renderBuilderForm({ focusGroup: groupIndex, focusField: builderState.itemCount });
    });
    const removeItemBtn = document.createElement("button");
    removeItemBtn.type = "button";
    removeItemBtn.className = "item-link-btn item-link-btn--danger";
    removeItemBtn.textContent = "– Item";
    removeItemBtn.setAttribute("aria-label", "Remove item from all groups");
    removeItemBtn.addEventListener("click", () => {
      removeLastItemFromAllGroups();
      renderBuilderForm({ focusGroup: groupIndex, focusField: Math.max(1, builderState.itemCount) });
    });
    const removePair = document.createElement("div");
    removePair.className = "item-actions-remove-pair";
    const removeGroupBtn = document.createElement("button");
    removeGroupBtn.type = "button";
    removeGroupBtn.className = "item-link-btn item-link-btn--danger";
    removeGroupBtn.textContent = "– Group";
    removeGroupBtn.disabled = builderState.groups.length <= 1;
    removeGroupBtn.setAttribute("aria-label", `Remove group ${groupIndex + 1}`);
    removeGroupBtn.addEventListener("click", () => {
      removeGroup(groupIndex);
      const nextFocus = Math.min(groupIndex, builderState.groups.length - 1);
      renderBuilderForm({ focusGroup: nextFocus, focusField: 0 });
    });
    removePair.appendChild(removeItemBtn);
    removePair.appendChild(removeGroupBtn);
    addItemRow.appendChild(addItemBtn);
    itemActions.appendChild(itemActionsDivider);
    itemActions.appendChild(addItemRow);
    itemActions.appendChild(removePair);
    card.appendChild(itemActions);

    row.appendChild(card);
  });

  const addGroupCard = document.createElement("button");
  addGroupCard.type = "button";
  addGroupCard.className = "add-group-card";
  addGroupCard.setAttribute("aria-label", "Add group");
  addGroupCard.innerHTML = '<span class="add-group-symbol">Click to add group</span>';
  addGroupCard.addEventListener("click", () => {
    addGroup();
    renderBuilderForm({ focusGroup: builderState.groups.length - 1, focusField: 0 });
  });
  row.appendChild(addGroupCard);
  groupFormContainer.appendChild(row);

  if (typeof options.focusGroup === "number" && typeof options.focusField === "number") {
    focusField(options.focusGroup, options.focusField);
  }
  updateBuilderStatus();
}

generateLinkBtn.addEventListener("click", () => {
  const validation = getBuilderValidationState();
  if (!validation.canGenerate) {
    updateBuilderStatus();
    return;
  }
  try {
    const puzzle = collectPuzzleFromForm();
    const playUrl = new URL("./play.html", window.location.href);
    playUrl.hash = encodePuzzleToHash(puzzle);
    window.open(playUrl.toString(), "_blank", "noopener,noreferrer");
    updateBuilderStatus();
  } catch (err) {
    updateBuilderStatus({ forceMessage: err.message });
  }
});

exportJsonBtn.addEventListener("click", () => {
  try {
    const puzzle = collectPuzzleFromForm();
    const payload = JSON.stringify(puzzle, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = "word-match-puzzle.json";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    URL.revokeObjectURL(url);
    updateBuilderStatus();
  } catch (err) {
    updateBuilderStatus({ forceMessage: err.message || "Could not export JSON." });
  }
});

importJsonBtn.addEventListener("click", () => {
  importJsonInput.click();
});

importJsonInput.addEventListener("change", async (event) => {
  const input = event.currentTarget;
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    applyPuzzleToBuilder(parsed);
    updateBuilderStatus();
  } catch (err) {
    updateBuilderStatus({ forceMessage: err.message || "Invalid JSON file." });
  } finally {
    input.value = "";
  }
});

clearDraftBtn.addEventListener("click", clearBuilderDraft);
loadBuilderDraft();
renderBuilderForm();
