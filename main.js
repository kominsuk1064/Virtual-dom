import { diff } from "./src/diff.js";
import { cloneVdom, domToVdom, vdomToDom } from "./src/vdom.js";

const realFrame = document.querySelector("#real-frame");
const testFrame = document.querySelector("#test-frame");
const initialCardTemplate = document.querySelector("#initial-card-template");
const titleField = document.querySelector("#field-title");
const descriptionField = document.querySelector("#field-description");
const itemsField = document.querySelector("#field-items");
const rootTagField = document.querySelector("#field-root-tag");
const themeField = document.querySelector("#field-theme");
const badgeField = document.querySelector("#field-badge");
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
const storyStatus = document.querySelector("#story-status");
const changeSummaryList = document.querySelector("#change-summary-list");
const speakerNote = document.querySelector("#speaker-note");
const scenarioMessage = document.querySelector("#scenario-message");
const scenarioButtons = Array.from(document.querySelectorAll("[data-scenario]"));
const embeddedSessionId = `session-${Date.now()}`;

let history = [];
let historyIndex = -1;
let currentVDOM = null;
let initialVDOM = null;
let lastPatchCount = 0;
let pendingPatches = [];
let currentValidation = {
  valid: false,
  message: "",
  vdom: null
};

const scenarioLabels = {
  text: "제목만 바꾸기",
  props: "속성만 바꾸기",
  add: "목록 1개 추가",
  remove: "목록 1개 삭제",
  replace: "루트 태그 바꾸기",
  sync: "현재 실제 화면 불러오기"
};

const frameReadyState = {
  actual: false,
  preview: false
};
const frameChannels = {
  actual: new BroadcastChannel(`virtual-dom-${embeddedSessionId}-actual`),
  preview: new BroadcastChannel(`virtual-dom-${embeddedSessionId}-preview`)
};
let resolveFramesReady = null;
const framesReadyPromise = new Promise((resolve) => {
  resolveFramesReady = resolve;
});

/**
 * Wait until both embedded web pages announce readiness.
 */
function waitForEmbeddedPages() {
  return framesReadyPromise;
}

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
 * Send a structured message to one embedded page.
 */
function postToFrame(kind, type, payload = {}) {
  frameChannels[kind]?.postMessage({
    source: "virtual-dom-host",
    kind,
    type,
    payload
  });
}

/**
 * Track readiness from each embedded website channel.
 */
function handleFrameChannelMessage(kind, event) {
  const data = event.data;

  if (!data || data.source !== "virtual-dom-site" || data.type !== "ready") {
    return;
  }

  frameReadyState[kind] = true;

  if (frameReadyState.actual && frameReadyState.preview) {
    resolveFramesReady?.();
    resolveFramesReady = null;
  }
}

frameChannels.actual.addEventListener("message", (event) => handleFrameChannelMessage("actual", event));
frameChannels.preview.addEventListener("message", (event) => handleFrameChannelMessage("preview", event));

/**
 * Point the host iframes at truly independent child sites for this host session.
 */
function initializeEmbeddedSites() {
  frameReadyState.actual = false;
  frameReadyState.preview = false;
  realFrame.src = `./actual-site/index.html?session=${encodeURIComponent(embeddedSessionId)}`;
  testFrame.src = `./preview-site/index.html?session=${encodeURIComponent(embeddedSessionId)}`;
}

/**
 * Ask one embedded page to render a full snapshot.
 */
function renderSnapshotInFrame(kind, vdom, patches = []) {
  postToFrame(kind, "render-snapshot", {
    vdom,
    patches
  });
}

/**
 * Ask one embedded page to clear all temporary highlights.
 */
function clearHighlightsInFrame(kind) {
  postToFrame(kind, "clear-highlights");
}

/**
 * Ask the actual embedded page to apply only patch operations.
 */
function applyPatchesInActualFrame(patches) {
  postToFrame("actual", "apply-patches", {
    patches
  });
}

/**
 * Render a friendly placeholder when the preview is invalid.
 */
function renderPreviewPlaceholder(message) {
  postToFrame("preview", "show-placeholder", { message });
}

/**
 * Return a readable summary line for the current patch list.
 */
function summarizePatches(patches) {
  if (!patches.length) {
    return "반영할 작업이 없습니다.";
  }

  const patchLabelMap = {
    ADD: "추가",
    REMOVE: "삭제",
    REPLACE: "교체",
    PROPS_UPDATE: "속성 변경",
    TEXT_UPDATE: "문구 변경"
  };

  const counts = patches.reduce((result, patch) => {
    result[patch.type] = (result[patch.type] ?? 0) + 1;
    return result;
  }, {});

  return Object.entries(counts)
    .map(([type, count]) => `${patchLabelMap[type] ?? type} ${count}개`)
    .join(", ");
}

/**
 * Render log lines for the current patch cycle.
 */
function renderPatchLog(title, patches = [], detailLines = []) {
  const lines = [`[상태] ${title}`];

  for (const detail of detailLines) {
    lines.push(detail);
  }

  lines.push(`[요약] ${summarizePatches(patches)}`);

  if (!patches.length) {
    lines.push("[작업] 없음");
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
  if (!vdomPreview) {
    return;
  }

  const sections = [caption];

  if (vdom) {
    sections.push(JSON.stringify(vdom, null, 2));
  } else {
    sections.push("{}");
  }

  vdomPreview.textContent = sections.join("\n\n");
}

/**
 * Update validation copy shown below the editor form.
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

  if (pendingPatches.length > 0) {
    patchCount.textContent = `${pendingPatches.length} 예정`;
  } else if (lastPatchCount > 0) {
    patchCount.textContent = `${lastPatchCount} 반영`;
  } else {
    patchCount.textContent = "0";
  }
}

/**
 * Enable or disable action buttons based on state.
 */
function updateButtonState() {
  patchButton.disabled = !currentValidation.valid || pendingPatches.length === 0;
  undoButton.disabled = historyIndex <= 0;
  redoButton.disabled = historyIndex >= history.length - 1;
  resetButton.disabled = history.length === 1 && historyIndex === 0;
}

/**
 * Read the current structured editor values.
 */
function getEditorValues() {
  return {
    title: titleField.value.trim(),
    description: descriptionField.value.trim(),
    items: itemsField.value
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean),
    rootTag: rootTagField.value,
    theme: themeField.value,
    badge: badgeField.value.trim()
  };
}

/**
 * Push a VDOM snapshot back into the structured editor fields.
 */
function syncEditorFieldsFromVdom(vdom) {
  const root = vdomToDom(cloneVdom(vdom));

  if (!root) {
    return;
  }

  titleField.value = root.querySelector("h1, h2, h3, h4")?.textContent?.trim() ?? "";
  descriptionField.value = root.querySelector(".catalog-card__body")?.textContent?.trim() ?? "";
  itemsField.value = Array.from(root.querySelectorAll("ul li, ol li"))
    .map((item) => item.textContent?.trim() ?? "")
    .filter(Boolean)
    .join("\n");
  rootTagField.value = root.tagName.toLowerCase();
  themeField.value = root.getAttribute("data-theme") ?? "mint";
  badgeField.value = root.querySelector(".sample-badge")?.textContent?.trim() ?? "";
}

/**
 * Build a normalized VDOM tree from the structured editor form.
 */
function buildVdomFromEditor(values) {
  const baseRoot = initialCardTemplate?.content?.firstElementChild?.cloneNode(true);

  if (!baseRoot) {
    return null;
  }

  let root = baseRoot;

  if (values.rootTag !== baseRoot.tagName.toLowerCase()) {
    const replacement = document.createElement(values.rootTag);

    for (const { name, value } of Array.from(baseRoot.attributes)) {
      replacement.setAttribute(name, value);
    }

    replacement.innerHTML = baseRoot.innerHTML;
    root = replacement;
  }

  root.setAttribute("data-theme", values.theme);
  root.setAttribute("data-state", values.theme === "berry" ? "compare" : "initial");
  root.classList.toggle("catalog-card--spotlight", values.theme === "berry");

  const heading = root.querySelector("h1, h2, h3, h4");
  if (heading) {
    heading.textContent = values.title;
  }

  const body = root.querySelector(".catalog-card__body");
  if (body) {
    body.textContent = values.description;
  }

  const list = root.querySelector("ul, ol");
  if (list) {
    list.replaceChildren();
    values.items.forEach((itemText, index) => {
      const item = document.createElement("li");
      item.setAttribute("data-item", `edited-${index + 1}`);
      item.textContent = itemText;
      list.appendChild(item);
    });
  }

  const badge = root.querySelector(".sample-badge");
  if (badge) {
    badge.textContent = values.badge;
  }

  return domToVdom(root);
}

/**
 * Validate the structured editor values and return a candidate VDOM.
 */
function validateEditorValues(values) {
  if (!values.title) {
    return {
      valid: false,
      message: "제목을 먼저 입력해야 후보 화면을 만들 수 있습니다.",
      vdom: null
    };
  }

  if (!values.description) {
    return {
      valid: false,
      message: "설명 문구를 입력해야 후보 화면을 만들 수 있습니다.",
      vdom: null
    };
  }

  if (!values.items.length) {
    return {
      valid: false,
      message: "요소는 한 줄 이상 입력해야 합니다.",
      vdom: null
    };
  }

  const nextVdom = buildVdomFromEditor(values);

  if (!nextVdom) {
    return {
      valid: false,
      message: "입력 항목을 비교용 후보 화면으로 바꾸지 못했습니다.",
      vdom: null
    };
  }

  return {
    valid: true,
    message: `제목 "${values.title}"이 들어간 후보 화면을 준비했습니다.`,
    vdom: nextVdom
  };
}

/**
 * Resolve a VDOM node by canonical child path.
 */
function getVNodeByPath(vdom, path) {
  let current = vdom;

  for (const index of path) {
    current = current?.children?.[index] ?? null;

    if (!current) {
      return null;
    }
  }

  return current;
}

/**
 * Format a node into a presenter-friendly label.
 */
function formatVNodeName(vnode) {
  if (!vnode) {
    return "노드";
  }

  if (vnode.type === "#text") {
    return "텍스트";
  }

  return `<${vnode.type}>`;
}

/**
 * Build a beginner-friendly explanation for a patch.
 */
function explainPatchInPlainLanguage(patch, oldVDOM, newVDOM) {
  switch (patch.type) {
    case "ADD": {
      const parentNode = getVNodeByPath(newVDOM, patch.path);
      return {
        title: "새 요소가 추가됩니다.",
        text: `${formatVNodeName(parentNode)} 안에 ${formatVNodeName(patch.node)}가 ${patch.index + 1}번째 위치로 들어갑니다.`
      };
    }

    case "REMOVE": {
      const targetNode = getVNodeByPath(oldVDOM, patch.path);
      const parentNode = getVNodeByPath(oldVDOM, patch.path.slice(0, -1));
      return {
        title: "기존 요소가 사라집니다.",
        text: `${formatVNodeName(parentNode)} 안의 ${formatVNodeName(targetNode)}가 제거됩니다.`
      };
    }

    case "REPLACE": {
      const oldNode = getVNodeByPath(oldVDOM, patch.path);
      return {
        title: "같은 자리가 다른 태그로 바뀝니다.",
        text: `${formatVNodeName(oldNode)}가 ${formatVNodeName(patch.node)}로 교체됩니다. 모양은 비슷해 보여도 DOM 구조는 바뀝니다.`
      };
    }

    case "PROPS_UPDATE": {
      const targetNode = getVNodeByPath(newVDOM, patch.path) ?? getVNodeByPath(oldVDOM, patch.path);
      const changedProps = [
        ...Object.keys(patch.setProps ?? {}).map((name) => `${name} 설정`),
        ...(patch.removeProps ?? []).map((name) => `${name} 제거`)
      ];

      return {
        title: "속성이 바뀝니다.",
        text: `${formatVNodeName(targetNode)}의 속성이 바뀝니다. ${changedProps.join(", ")} 작업이 필요합니다.`
      };
    }

    case "TEXT_UPDATE": {
      const parentNode = getVNodeByPath(newVDOM, patch.path.slice(0, -1));
      return {
        title: "문구가 바뀝니다.",
        text: `${formatVNodeName(parentNode)} 안의 문장이 새로운 내용으로 바뀝니다.`
      };
    }

    default:
      return {
        title: "변화가 감지되었습니다.",
        text: "기술 로그에서 자세한 반영 작업 원본을 확인할 수 있습니다."
      };
  }
}

/**
 * Render the plain-language summary entries.
 */
function renderSummaryEntries(entries) {
  if (!changeSummaryList) {
    return;
  }

  changeSummaryList.replaceChildren();

  for (const entry of entries) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    const text = document.createElement("p");

    title.textContent = entry.title;
    text.textContent = entry.text;

    item.appendChild(title);
    item.appendChild(text);
    changeSummaryList.appendChild(item);
  }
}

/**
 * Render the beginner-friendly change summary panel.
 */
function renderChangeSummary(mode, options = {}) {
  if (!storyStatus || !speakerNote || !changeSummaryList) {
    return;
  }

  const {
    patches = [],
    validation = currentValidation,
    nextVdom = validation.vdom,
    droppedRedoCount = 0,
    oldVDOM = currentVDOM
  } = options;

  if (mode === "invalid") {
    storyStatus.textContent = "지금은 비교할 후보 화면을 만들 수 없습니다. 먼저 입력 규칙부터 맞춰야 합니다.";
    speakerNote.textContent =
      "“지금은 비교 가능한 다음 화면을 못 만들었기 때문에, 먼저 맨 바깥 요소 규칙부터 맞춰야 합니다.”";
    renderSummaryEntries([
      {
        title: "왜 막혔나요?",
        text: validation.message
      },
      {
        title: "어떻게 고치나요?",
        text: "맨 바깥 요소를 1개만 남기고, 공백이 아닌 바깥쪽 텍스트를 제거하면 다시 비교할 수 있습니다."
      }
    ]);
    return;
  }

  if (mode === "synced") {
    storyStatus.textContent = "왼쪽 실제 화면과 오른쪽 후보 화면이 같습니다. 지금은 반영할 새 변화가 없습니다.";
    speakerNote.textContent =
      "“두 화면이 이미 같기 때문에, 지금 변화 반영을 눌러도 새로 반영할 내용은 없습니다.”";
    renderSummaryEntries([
      {
        title: "현재 상태",
        text: "실제 화면과 후보 화면이 같은 정규화 상태입니다."
      },
      {
        title: "다음 행동",
        text: "입력 항목을 수정하거나 프리셋 시나리오를 눌러 새로운 변화를 만들어 보세요."
      }
    ]);
    return;
  }

  if (mode === "pending") {
    const entries = patches.slice(0, 4).map((patch) => explainPatchInPlainLanguage(patch, oldVDOM, nextVdom));

    if (patches.length > 4) {
      entries.push({
        title: "추가 변화가 더 있습니다.",
        text: `이 외에도 ${patches.length - 4}개의 변화가 더 있습니다. 아래 기술 로그를 열면 반영 작업 원본을 모두 볼 수 있습니다.`
      });
    }

    storyStatus.textContent = `${patches.length}개의 변화가 발견됐습니다. 아직은 오른쪽 후보 화면에만 보이고, 변화 반영을 눌러야 왼쪽 실제 화면에 반영됩니다.`;
    speakerNote.textContent =
      "“오른쪽은 다음 후보 화면이고, 방금 컴퓨터가 바뀐 부분만 추려냈습니다. 이제 변화 반영을 눌러 실제 화면에 적용하겠습니다.”";
    renderSummaryEntries(entries);
    return;
  }

  if (mode === "applied") {
    const entries = patches.slice(0, 4).map((patch) => explainPatchInPlainLanguage(patch, oldVDOM, nextVdom));

    if (droppedRedoCount > 0) {
      entries.push({
        title: "다음 상태 이력이 정리되었습니다.",
        text: `이전 상태로 돌아간 뒤 새 변화를 반영했기 때문에, 뒤쪽 다음 상태 ${droppedRedoCount}개는 규칙에 따라 제거되었습니다.`
      });
    }

    storyStatus.textContent = `변화 반영을 눌러 실제 화면에 ${patches.length}개의 변화가 반영되었습니다. 이제 왼쪽과 오른쪽이 같은 최신 상태입니다.`;
    speakerNote.textContent =
      "“이제 왼쪽 실제 화면에도 필요한 부분만 반영됐고, 이 상태가 이력에 새로 저장되었습니다.”";
    renderSummaryEntries(entries);
    return;
  }

  storyStatus.textContent = "저장된 화면을 다시 꺼내 왼쪽 실제 화면과 오른쪽 후보 화면을 같은 상태로 맞췄습니다.";
  speakerNote.textContent =
    "“이전 상태와 다음 상태 버튼은 반영 작업을 다시 계산하는 대신, 저장된 화면을 그대로 꺼내 두 영역을 함께 맞춥니다.”";
  renderSummaryEntries([
    {
      title: "지금 무슨 일이 일어났나요?",
      text: "선택한 이력 상태를 기준으로 실제 화면, 후보 화면, 입력 항목을 한 번에 다시 맞췄습니다."
    },
    {
      title: "왜 전체 렌더를 하나요?",
      text: "이전 상태 / 다음 상태에서는 예전 화면을 정확히 복원하는 것이 목적이라 전체 동기화를 허용합니다."
    }
  ]);
}

/**
 * Build a detached DOM root from the current actual-state VDOM.
 */
function buildEditableRootFromCurrentState() {
  if (currentVDOM) {
    return vdomToDom(cloneVdom(currentVDOM));
  }

  return initialCardTemplate?.content?.firstElementChild?.cloneNode(true) ?? null;
}

/**
 * Return the next scenario item that is not already present.
 */
function getNextSampleItem(existingKeys) {
  const candidates = [
    { key: "grape", label: "포도젤리 1개" },
    { key: "strawberry", label: "딸기바 2개" },
    { key: "coffee", label: "콜드브루 1병" },
    { key: "granola", label: "그래놀라 1봉" }
  ];

  return candidates.find((item) => !existingKeys.has(item.key)) ?? {
    key: `sample-${existingKeys.size + 1}`,
    label: `새 샘플 간식 ${existingKeys.size + 1}개`
  };
}

/**
 * Build a presenter-friendly draft VDOM from the current actual DOM.
 */
function buildScenarioDraft(kind) {
  const cleanActualRoot = buildEditableRootFromCurrentState();

  if (kind === "sync") {
    return {
      vdom: cloneVdom(currentVDOM),
      message: "현재 실제 화면을 그대로 편집기에 불러왔습니다."
    };
  }

  const root = cleanActualRoot;

  if (!root) {
    return {
      vdom: null,
      message: "현재 실제 화면을 찾지 못했습니다."
    };
  }

  if (kind === "text") {
    const heading = root.querySelector("h1, h2, h3, h4");

    if (heading) {
      heading.textContent =
        heading.textContent === "발표 데모용 간식 박스"
          ? "정글 간식 꾸러미"
          : "발표 데모용 간식 박스";
    }

    return {
      vdom: domToVdom(root),
      message: "제목만 바뀐 후보 화면을 만들었습니다."
    };
  }

  if (kind === "props") {
    const currentTheme = root.getAttribute("data-theme") ?? "mint";
    root.setAttribute("data-theme", currentTheme === "mint" ? "berry" : "mint");
    root.setAttribute("data-state", currentTheme === "mint" ? "compare" : "initial");
    root.classList.toggle("catalog-card--spotlight");

    return {
      vdom: domToVdom(root),
      message: "속성만 바뀐 후보 화면을 만들었습니다."
    };
  }

  if (kind === "add") {
    const list = root.querySelector("ul, ol");

    if (list) {
      const existingKeys = new Set(Array.from(list.children).map((item) => item.getAttribute("data-item")));
      const nextItem = getNextSampleItem(existingKeys);
      const newItem = document.createElement("li");

      newItem.setAttribute("data-item", nextItem.key);
      newItem.textContent = nextItem.label;
      list.appendChild(newItem);
    }

    return {
      vdom: domToVdom(root),
      message: "목록이 1개 추가된 후보 화면을 만들었습니다."
    };
  }

  if (kind === "remove") {
    const removableItem = root.querySelector("ul li:last-child, ol li:last-child");
    const removableFallback = root.querySelector(".catalog-card__footer") ?? root.lastElementChild;

    if (removableItem) {
      removableItem.remove();
    } else if (removableFallback && removableFallback !== root.querySelector(".catalog-card__header")) {
      removableFallback.remove();
    }

    return {
      vdom: domToVdom(root),
      message: "목록 또는 마지막 블록이 하나 줄어든 후보 화면을 만들었습니다."
    };
  }

  const replacementTag = root.tagName.toLowerCase() === "section" ? "article" : "section";
  const replacement = document.createElement(replacementTag);

  for (const { name, value } of Array.from(root.attributes)) {
    replacement.setAttribute(name, value);
  }

  replacement.innerHTML = root.innerHTML;

  return {
    vdom: domToVdom(replacement),
    message: `루트 태그를 <${replacementTag}>로 바꾼 후보 화면을 만들었습니다.`
  };
}

/**
 * Apply a preset scenario to the structured editor.
 */
function applyScenario(kind) {
  const draft = buildScenarioDraft(kind);
  scenarioMessage.textContent = draft.message;

  if (!draft.vdom) {
    return;
  }

  syncEditorFieldsFromVdom(draft.vdom);
  const validation = refreshPreviewFromEditor(`${scenarioLabels[kind]} 시나리오를 적용했습니다.`);
  updateStatus(validation.valid ? "시나리오 초안 준비" : "입력 오류");
}

/**
 * Rebuild the candidate VDOM from the structured editor and refresh the preview panel.
 */
function refreshPreviewFromEditor(reason = "입력 항목 기준으로 후보 화면을 다시 계산했습니다.") {
  const validation = validateEditorValues(getEditorValues());
  currentValidation = validation;
  clearHighlightsInFrame("actual");

  if (validation.valid) {
    pendingPatches = diff(currentVDOM, validation.vdom);

    renderSnapshotInFrame("preview", validation.vdom, pendingPatches);
    renderVdomPreview(validation.vdom, `[미리보기] ${reason}`);
    setValidationMessage(true, validation.message);

    if (pendingPatches.length > 0) {
      renderChangeSummary("pending", {
        patches: pendingPatches,
        validation,
        nextVdom: validation.vdom,
        oldVDOM: currentVDOM
      });
      renderPatchLog("미리보기 준비 완료", pendingPatches, [
        `[미리보기] ${reason}`,
        "[안내] 아직 실제 화면에는 반영되지 않았습니다."
      ]);
      updateStatus("비교 완료");
    } else {
      renderChangeSummary("synced", {
        validation,
        nextVdom: validation.vdom
      });
      renderPatchLog("변화 없음", [], [
        `[미리보기] ${reason}`,
        "[안내] 실제 화면과 후보 화면이 동일합니다."
      ]);
      updateStatus("변경 없음");
    }
  } else {
    pendingPatches = [];
    renderPreviewPlaceholder(validation.message);
    renderVdomPreview(currentVDOM, `[검증] ${validation.message}`);
    setValidationMessage(false, validation.message);
    renderChangeSummary("invalid", { validation });
    renderPatchLog("미리보기 중단", [], [`[이유] ${validation.message}`]);
    updateStatus("입력 오류");
  }

  updateButtonState();
  return validation;
}

/**
 * Sync actual area, preview area, and structured editor from a VDOM snapshot.
 */
function syncBothAreasFromVdom(vdom) {
  const snapshot = cloneVdom(vdom);

  renderSnapshotInFrame("actual", snapshot);
  renderSnapshotInFrame("preview", snapshot);
  syncEditorFieldsFromVdom(snapshot);

  currentValidation = {
    valid: true,
    message: "실제 페이지와 후보 페이지, 입력 항목을 현재 이력 상태로 다시 맞췄습니다.",
    vdom: snapshot
  };
  pendingPatches = [];

  setValidationMessage(true, currentValidation.message);
  renderVdomPreview(snapshot, "[현재 상태] 정규화된 가상 DOM");
  renderChangeSummary("history", {
    validation: currentValidation,
    nextVdom: snapshot
  });
  updateButtonState();
}

/**
 * Apply the structured editor changes to the actual DOM as patches.
 */
function handlePatch() {
  const validation = refreshPreviewFromEditor("반영 직전 비교를 다시 계산했습니다.");

  if (!validation.valid) {
    lastPatchCount = 0;
    updateStatus("입력 오류");
    return;
  }

  const nextVdom = cloneVdom(validation.vdom);
  const patches = diff(currentVDOM, nextVdom);

  if (!patches.length) {
    lastPatchCount = 0;
    renderChangeSummary("synced", {
      validation,
      nextVdom
    });
    renderPatchLog("변화 없음", [], [
      "[안내] 현재 입력 항목으로 만든 후보 화면이 실제 화면 상태와 동일합니다."
    ]);
    renderVdomPreview(nextVdom, "[현재 상태] 반영할 변화 없음");
    setValidationMessage(true, "변경점이 없어서 반영을 생략했습니다.");
    updateStatus("변경 없음");
    updateButtonState();
    return;
  }

  const droppedRedoCount = Math.max(0, history.length - historyIndex - 1);

  const oldSnapshot = currentVDOM;
  applyPatchesInActualFrame(patches);
  currentVDOM = cloneVdom(nextVdom);
  history = history.slice(0, historyIndex + 1);
  history.push(cloneVdom(nextVdom));
  historyIndex = history.length - 1;
  lastPatchCount = patches.length;
  pendingPatches = [];
  currentValidation = {
    valid: true,
    message: `${patches.length}개의 반영 작업을 실제 화면에 적용했습니다.`,
    vdom: cloneVdom(nextVdom)
  };

  renderSnapshotInFrame("preview", nextVdom, patches);

  renderPatchLog("반영 완료", patches, [
    droppedRedoCount > 0
      ? `[이력] ${droppedRedoCount}개의 다음 상태를 정리하고 새 상태를 저장했습니다.`
      : "[이력] 새 상태를 마지막 위치에 저장했습니다.",
    `[이력 위치] ${historyIndex + 1} / ${history.length}`
  ]);
  renderVdomPreview(nextVdom, "[현재 상태] 반영 후 가상 DOM");
  setValidationMessage(true, currentValidation.message);
  renderChangeSummary("applied", {
    patches,
    validation: currentValidation,
    nextVdom,
    droppedRedoCount,
    oldVDOM: oldSnapshot
  });
  updateStatus("실제 반영 완료");
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

  renderPatchLog("이전 상태 복원 완료", [], [
    `[이력 위치] ${historyIndex + 1} / ${history.length}`,
    "[동기화] 저장된 이전 화면을 기준으로 실제 영역과 후보 영역을 다시 렌더했습니다."
  ]);
  updateStatus("이전 화면 복원");
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

  renderPatchLog("다음 상태 복원 완료", [], [
    `[이력 위치] ${historyIndex + 1} / ${history.length}`,
    "[동기화] 저장된 다음 화면을 기준으로 실제 영역과 후보 영역을 다시 렌더했습니다."
  ]);
  updateStatus("다음 화면 복원");
}

/**
 * Restore the initial sample state and restart history from there.
 */
function handleReset() {
  history = [cloneVdom(initialVDOM)];
  historyIndex = 0;
  currentVDOM = cloneVdom(initialVDOM);
  lastPatchCount = 0;
  pendingPatches = [];

  syncBothAreasFromVdom(initialVDOM);
  scenarioMessage.textContent = "처음 샘플 상태와 이력을 다시 시작했습니다.";
  renderPatchLog("처음 샘플 복원 완료", [], [
    "[상태] 초기 샘플 DOM으로 되돌렸습니다.",
    "[이력] 처음으로 버튼은 이력을 초기 샘플 1개 상태로 다시 시작합니다."
  ]);
  updateStatus("처음 샘플 복원");
}

/**
 * Bootstrap the playground from the static actual area markup.
 */
function init() {
  const actualRootElement = initialCardTemplate?.content?.firstElementChild?.cloneNode(true);

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
  pendingPatches = [];

  syncBothAreasFromVdom(initialVDOM);
  renderPatchLog("준비 완료", [], [
    "[초기화] 실제 영역 DOM을 읽어 정규화된 가상 DOM으로 맞췄습니다.",
    "[다음 단계] 시나리오 버튼이나 입력 항목을 사용해 오른쪽 후보 화면을 먼저 바꿔 보세요."
  ]);
  scenarioMessage.textContent = "프리셋 시나리오 또는 입력 항목 수정으로 다음 후보 화면을 만들어 보세요.";
  updateStatus("설명 준비 완료");
}

/**
 * Boot the app after both embedded pages are ready.
 */
async function bootstrap() {
  initializeEmbeddedSites();
  await waitForEmbeddedPages();

  [titleField, descriptionField, itemsField, badgeField].forEach((field) => {
    field.addEventListener("input", () => {
      refreshPreviewFromEditor("입력 항목 수정으로 후보 화면을 다시 계산했습니다.");
    });
  });

  [rootTagField, themeField].forEach((field) => {
    field.addEventListener("change", () => {
      refreshPreviewFromEditor("선택 항목 변경으로 후보 화면을 다시 계산했습니다.");
    });
  });

  // MOD: 발표자가 오타 없이 핵심 케이스를 시연할 수 있도록 프리셋 시나리오를 연결
  scenarioButtons.forEach((button) => {
    button.addEventListener("click", () => {
      applyScenario(button.dataset.scenario);
    });
  });

  patchButton.addEventListener("click", handlePatch);
  undoButton.addEventListener("click", handleUndo);
  redoButton.addEventListener("click", handleRedo);
  resetButton.addEventListener("click", handleReset);

  init();
}

bootstrap();
