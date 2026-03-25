import { applyPatches } from "./src/patch.js";
import { diff } from "./src/diff.js";
import { cloneVdom, domToVdom, vdomToDom } from "./src/vdom.js";

const realRoot = document.querySelector("#real-root");
const testRoot = document.querySelector("#test-root");
const htmlInput = document.querySelector("#html-input");
const patchButton = document.querySelector("#patch-button");
const undoButton = document.querySelector("#undo-button");
const redoButton = document.querySelector("#redo-button");
const resetButton = document.querySelector("#reset-button");
const patchLog = document.querySelector("#patch-log");
const vdomPreview = document.querySelector("#vdom-preview");
const validationMessage = document.querySelector("#validation-message");
const stateIndicator = document.querySelector("#state-indicator");
const historyIndicator = document.querySelector("#history-indicator");
const patchCount = document.querySelector("#patch-count");

let history = [];
let historyIndex = -1;
let currentVDOM = null;
let actualRootNode = null;
let initialVDOM = null;
let lastPatchCount = 0;
let currentValidation = {
  valid: false,
  message: "",
  vdom: null
};

/**
 * Check whether a top-level parsed node should participate in validation.
 */
function isMeaningfulTopLevelNode(node) {
  if (!node) {
    return false;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    return true;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "").trim() !== "";
  }

  return false;
}

/**
 * Render a VDOM tree into a container and return the new root node.
 */
function renderVdomIntoContainer(container, vdom) {
  container.replaceChildren();

  if (!vdom) {
    return null;
  }

  const domNode = vdomToDom(vdom);
  container.appendChild(domNode);
  return domNode;
}

/**
 * Return a readable summary line for the current patch list.
 */
function summarizePatches(patches) {
  if (!patches.length) {
    return "No patches generated.";
  }

  const counts = patches.reduce((result, patch) => {
    result[patch.type] = (result[patch.type] ?? 0) + 1;
    return result;
  }, {});

  return Object.entries(counts)
    .map(([type, count]) => `${type} x${count}`)
    .join(", ");
}

/**
 * Render log lines for the current patch cycle.
 */
function renderPatchLog(title, patches = [], detailLines = []) {
  const lines = [`[status] ${title}`];

  for (const detail of detailLines) {
    lines.push(detail);
  }

  lines.push(`[summary] ${summarizePatches(patches)}`);

  if (!patches.length) {
    lines.push("[patches] none");
  } else {
    patches.forEach((patch, index) => {
      lines.push(`${String(index + 1).padStart(2, "0")}. ${JSON.stringify(patch)}`);
    });
  }

  patchLog.textContent = lines.join("\n");
}

/**
 * Render the current VDOM JSON for inspection.
 */
function renderVdomPreview(vdom, caption) {
  const sections = [caption];

  if (vdom) {
    sections.push(JSON.stringify(vdom, null, 2));
  } else {
    sections.push("{}");
  }

  vdomPreview.textContent = sections.join("\n\n");
}

/**
 * Update validation copy shown below the textarea.
 */
function setValidationMessage(valid, message) {
  validationMessage.dataset.state = valid ? "ok" : "error";
  validationMessage.textContent = message;
}

/**
 * Reflect the current state in the metric cards.
 */
function updateStatus(statusLabel) {
  stateIndicator.textContent = statusLabel;
  historyIndicator.textContent = history.length ? `${historyIndex + 1} / ${history.length}` : "0 / 0";
  patchCount.textContent = String(lastPatchCount);
}

/**
 * Enable or disable action buttons based on state.
 */
function updateButtonState() {
  patchButton.disabled = !currentValidation.valid;
  undoButton.disabled = historyIndex <= 0;
  redoButton.disabled = historyIndex >= history.length - 1;
  resetButton.disabled = history.length === 0;
}

/**
 * Parse textarea HTML into a validated, canonical VDOM tree.
 */
function parseHtmlInput(html) {
  const template = document.createElement("template");
  template.innerHTML = html;

  const topLevelNodes = Array.from(template.content.childNodes).filter(isMeaningfulTopLevelNode);

  if (topLevelNodes.length === 0) {
    return {
      valid: false,
      message: "최상위에 element 1개가 필요합니다.",
      vdom: null
    };
  }

  const hasMeaningfulText = topLevelNodes.some((node) => node.nodeType === Node.TEXT_NODE);

  if (hasMeaningfulText) {
    return {
      valid: false,
      message: "최상위에는 공백이 아닌 Text 노드를 둘 수 없습니다.",
      vdom: null
    };
  }

  const elementNodes = topLevelNodes.filter((node) => node.nodeType === Node.ELEMENT_NODE);

  if (elementNodes.length !== 1 || topLevelNodes.length !== 1) {
    return {
      valid: false,
      message: "최상위 element는 정확히 1개만 허용됩니다.",
      vdom: null
    };
  }

  const nextVdom = domToVdom(elementNodes[0]);

  if (!nextVdom) {
    return {
      valid: false,
      message: "입력 HTML을 canonical VDOM으로 변환하지 못했습니다.",
      vdom: null
    };
  }

  return {
    valid: true,
    message: `루트 <${nextVdom.type}> 를 preview에 렌더링했습니다.`,
    vdom: nextVdom
  };
}

/**
 * Re-parse the textarea and refresh the preview panel.
 */
function refreshPreviewFromTextarea(reason = "Preview refreshed from textarea.") {
  const validation = parseHtmlInput(htmlInput.value);
  currentValidation = validation;

  if (validation.valid) {
    renderVdomIntoContainer(testRoot, validation.vdom);
    renderVdomPreview(validation.vdom, `[preview] ${reason}`);
    setValidationMessage(true, validation.message);
  } else {
    renderVdomPreview(currentVDOM, `[validation] ${validation.message}`);
    setValidationMessage(false, validation.message);
  }

  updateButtonState();
  return validation;
}

/**
 * Sync actual area, preview area, and textarea from a VDOM snapshot.
 */
function syncBothAreasFromVdom(vdom) {
  const snapshot = cloneVdom(vdom);

  actualRootNode = renderVdomIntoContainer(realRoot, snapshot);
  renderVdomIntoContainer(testRoot, snapshot);
  htmlInput.value = actualRootNode?.outerHTML ?? "";

  currentValidation = {
    valid: true,
    message: "실제 영역, preview, textarea를 현재 history state로 동기화했습니다.",
    vdom: snapshot
  };

  setValidationMessage(true, currentValidation.message);
  renderVdomPreview(snapshot, "[current] Canonical VDOM snapshot");
  updateButtonState();
}

/**
 * Apply the textarea changes to the actual DOM as patches.
 */
function handlePatch() {
  const validation = refreshPreviewFromTextarea("Preview parsed just before patch.");

  if (!validation.valid) {
    lastPatchCount = 0;
    renderPatchLog("Patch blocked", [], [`[reason] ${validation.message}`]);
    updateStatus("Input Error");
    return;
  }

  const nextVdom = cloneVdom(validation.vdom);
  const patches = diff(currentVDOM, nextVdom);

  if (!patches.length) {
    lastPatchCount = 0;
    renderPatchLog("No changes detected", [], [
      "[info] 현재 textarea의 canonical VDOM이 실제 영역 상태와 동일합니다."
    ]);
    renderVdomPreview(nextVdom, "[current] No-op patch");
    setValidationMessage(true, "변경점이 없어서 patch를 생략했습니다.");
    updateStatus("No Changes");
    updateButtonState();
    return;
  }

  const droppedRedoCount = Math.max(0, history.length - historyIndex - 1);

  actualRootNode = applyPatches(actualRootNode, patches);
  currentVDOM = cloneVdom(nextVdom);
  history = history.slice(0, historyIndex + 1);
  history.push(cloneVdom(nextVdom));
  historyIndex = history.length - 1;
  lastPatchCount = patches.length;

  renderPatchLog("Patch applied", patches, [
    droppedRedoCount > 0
      ? `[history] ${droppedRedoCount}개의 redo state를 정리하고 새 state를 저장했습니다.`
      : "[history] 새 state를 마지막 위치에 저장했습니다.",
    `[history-index] ${historyIndex + 1} / ${history.length}`
  ]);
  renderVdomPreview(nextVdom, "[current] Canonical VDOM after patch");
  setValidationMessage(true, `${patches.length}개의 patch를 실제 영역에 반영했습니다.`);
  updateStatus("Patched");
  updateButtonState();
}

/**
 * Move to the previous history state.
 */
function handleUndo() {
  if (historyIndex <= 0) {
    return;
  }

  historyIndex -= 1;
  lastPatchCount = 0;
  syncBothAreasFromVdom(history[historyIndex]);
  currentVDOM = cloneVdom(history[historyIndex]);

  renderPatchLog("Undo completed", [], [
    `[history-index] ${historyIndex + 1} / ${history.length}`,
    "[sync] 실제 영역과 preview를 선택한 history state로 전체 렌더했습니다."
  ]);
  updateStatus("Undo");
}

/**
 * Move to the next history state.
 */
function handleRedo() {
  if (historyIndex >= history.length - 1) {
    return;
  }

  historyIndex += 1;
  lastPatchCount = 0;
  syncBothAreasFromVdom(history[historyIndex]);
  currentVDOM = cloneVdom(history[historyIndex]);

  renderPatchLog("Redo completed", [], [
    `[history-index] ${historyIndex + 1} / ${history.length}`,
    "[sync] 실제 영역과 preview를 선택한 history state로 전체 렌더했습니다."
  ]);
  updateStatus("Redo");
}

/**
 * Restore the initial sample state.
 */
function handleReset() {
  history = [cloneVdom(initialVDOM)];
  historyIndex = 0;
  currentVDOM = cloneVdom(initialVDOM);
  lastPatchCount = 0;

  syncBothAreasFromVdom(initialVDOM);
  renderPatchLog("Reset completed", [], ["[state] 초기 샘플 DOM으로 되돌렸습니다."]);
  updateStatus("Reset");
}

/**
 * Bootstrap the playground from the static actual area markup.
 */
function init() {
  const actualRootElement = realRoot.firstElementChild;

  if (!actualRootElement) {
    throw new Error("Initial actual area root element is missing.");
  }

  initialVDOM = domToVdom(actualRootElement);

  if (!initialVDOM) {
    throw new Error("Failed to build the initial VDOM from the actual area.");
  }

  history = [cloneVdom(initialVDOM)];
  historyIndex = 0;
  currentVDOM = cloneVdom(initialVDOM);
  lastPatchCount = 0;

  syncBothAreasFromVdom(initialVDOM);
  renderPatchLog("Prototype ready", [], [
    "[init] 실제 영역 DOM을 읽어 canonical VDOM으로 정규화했습니다.",
    "[next] textarea에서 HTML을 수정한 뒤 Patch를 눌러 부분 업데이트를 확인해 보세요."
  ]);
  updateStatus("Ready");
}

htmlInput.addEventListener("input", () => {
  const validation = refreshPreviewFromTextarea("Live preview refreshed from textarea.");
  updateStatus(validation.valid ? "Preview Ready" : "Input Error");
});

patchButton.addEventListener("click", handlePatch);
undoButton.addEventListener("click", handleUndo);
redoButton.addEventListener("click", handleRedo);
resetButton.addEventListener("click", handleReset);

init();
