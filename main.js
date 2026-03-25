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
const suspectOneNameField = document.querySelector("#suspect-one-name");
const suspectOnePhotoField = document.querySelector("#suspect-one-photo");
const suspectOneFileField = document.querySelector("#suspect-one-file");
const suspectOneNoteField = document.querySelector("#suspect-one-note");
const suspectOnePhotoPreview = document.querySelector("#suspect-one-photo-preview");
const suspectOnePhotoState = document.querySelector("#suspect-one-photo-state");
const suspectTwoNameField = document.querySelector("#suspect-two-name");
const suspectTwoPhotoField = document.querySelector("#suspect-two-photo");
const suspectTwoFileField = document.querySelector("#suspect-two-file");
const suspectTwoNoteField = document.querySelector("#suspect-two-note");
const suspectTwoPhotoPreview = document.querySelector("#suspect-two-photo-preview");
const suspectTwoPhotoState = document.querySelector("#suspect-two-photo-state");
const patchButton = document.querySelector("#patch-button");
const undoButton = document.querySelector("#undo-button");
const redoButton = document.querySelector("#redo-button");
const resetButton = document.querySelector("#reset-button");
const patchLog = document.querySelector("#patch-log");
const directCodeEditor = document.querySelector("#direct-code-editor");
const directCodeMessage = document.querySelector("#direct-code-message");
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
const photoResetButtons = Array.from(document.querySelectorAll("[data-photo-reset]"));
const embeddedSessionId = `session-${Date.now()}`;

const suspectPhotoControls = {
  a: {
    field: suspectOnePhotoField,
    file: suspectOneFileField,
    preview: suspectOnePhotoPreview,
    state: suspectOnePhotoState,
    nameField: suspectOneNameField
  },
  b: {
    field: suspectTwoPhotoField,
    file: suspectTwoFileField,
    preview: suspectTwoPhotoPreview,
    state: suspectTwoPhotoState,
    nameField: suspectTwoNameField
  }
};

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
  text: "사건명 바꾸기",
  props: "긴급도 바꾸기",
  add: "단서 1개 추가",
  remove: "단서 1개 제거",
  replace: "보드 태그 바꾸기",
  sync: "현재 수사 보드 불러오기"
};
const EMPTY_CLUE_KEY = "empty-clue";
const EMPTY_CLUE_LABEL = "아직 확보된 단서 없음";

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
 * Update the note shown below the direct HTML editor.
 */
function setDirectCodeMessage(valid, message) {
  if (!directCodeMessage) {
    return;
  }

  directCodeMessage.dataset.state = valid ? "ok" : "error";
  directCodeMessage.textContent = message;
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
    badge: badgeField.value.trim(),
    suspects: [
      {
        slot: "a",
        name: suspectOneNameField.value.trim(),
        photo: readPhotoToken(suspectOnePhotoField),
        note: suspectOneNoteField.value.trim()
      },
      {
        slot: "b",
        name: suspectTwoNameField.value.trim(),
        photo: readPhotoToken(suspectTwoPhotoField),
        note: suspectTwoNoteField.value.trim()
      }
    ]
  };
}

/**
 * Build a fallback mugshot image when the user did not provide a custom photo URL.
 */
function createDefaultSuspectPhoto(name, slot, theme) {
  const label = slot === "a" ? "A-12" : "B-07";
  const initials = (name || "??")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
  const stroke = theme === "berry" ? "#8e251c" : "#7a2419";
  const fill = theme === "berry" ? "#d3bfaf" : "#c5b7a5";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 240">
      <rect width="220" height="240" rx="24" fill="#efe7da"/>
      <rect x="24" y="22" width="172" height="196" rx="18" fill="${fill}"/>
      <circle cx="110" cy="92" r="38" fill="#937c6b"/>
      <path d="M58 188c14-34 38-50 52-50s38 16 52 50" fill="#937c6b"/>
      <path d="M34 36h152" stroke="${stroke}" stroke-width="6" stroke-linecap="round"/>
      <text x="110" y="154" text-anchor="middle" font-size="24" font-family="Arial" fill="${stroke}">${initials}</text>
      <text x="110" y="214" text-anchor="middle" font-size="18" font-family="Arial" fill="${stroke}">${label}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/**
 * Store a compact token in the editor while allowing presets and uploads.
 */
function readPhotoToken(field) {
  const manualValue = field.value.trim();

  if (manualValue) {
    return manualValue;
  }

  if (field.dataset.photoMode === "upload") {
    return field.dataset.photoValue ?? "";
  }

  return "";
}

/**
 * Restore the editor photo field from a saved token.
 */
function writePhotoToken(field, token) {
  field.value = "";
  delete field.dataset.photoMode;
  delete field.dataset.photoValue;

  if (!token) {
    return;
  }

  if (token.startsWith("data:image/")) {
    field.dataset.photoMode = "upload";
    field.dataset.photoValue = token;
    return;
  }

  field.value = token;
}

/**
 * Turn the stored token into an actual image source for the rendered board.
 */
function resolvePhotoSource(token, name, slot, theme) {
  if (!token) {
    return createDefaultSuspectPhoto(name, slot, theme);
  }

  return token;
}

/**
 * Describe the current photo source in friendly language.
 */
function describePhotoSource(field) {
  const manualValue = field.value.trim();

  if (manualValue) {
    return "선택한 사진 사용 중";
  }

  if (field.dataset.photoMode === "upload") {
    return "업로드한 사진 사용 중";
  }

  return "기본 수배 사진 사용 중";
}

/**
 * Refresh preview images and preset buttons inside the editor.
 */
function refreshPhotoControls() {
  const theme = themeField.value;

  for (const [slot, control] of Object.entries(suspectPhotoControls)) {
    const name = control.nameField.value.trim() || `용의자 ${slot.toUpperCase()}`;
    const token = readPhotoToken(control.field);
    const resolvedSource = resolvePhotoSource(token, name, slot, theme);

    control.preview.src = resolvedSource;
    control.preview.alt = `${name} 사진 미리보기`;
    control.state.textContent = describePhotoSource(control.field);
  }
}

/**
 * Build a stylized evidence snapshot for the board side panel.
 */
function createEvidencePhoto(title, badge, theme) {
  const stroke = theme === "berry" ? "#8e251c" : "#7a2419";
  const accent = theme === "berry" ? "#d5b39d" : "#cfb691";
  const badgeText = badge || "추적 중";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 190">
      <rect width="240" height="190" rx="20" fill="#efe7da"/>
      <rect x="18" y="18" width="204" height="110" rx="14" fill="${accent}"/>
      <path d="M34 110l36-30 30 18 40-40 30 18 36-26" fill="none" stroke="${stroke}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="120" y="152" text-anchor="middle" font-size="18" font-family="Arial" fill="#513a2d">${title.slice(0, 10)}</text>
      <text x="120" y="172" text-anchor="middle" font-size="15" font-family="Arial" fill="${stroke}">${badgeText.slice(0, 12)}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/**
 * Format one DOM node into readable HTML for the direct code editor.
 */
function formatDomNodeAsHtml(node, depth = 0) {
  const indent = "  ".repeat(depth);

  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? "").trim();
    return text ? `${indent}${text}` : "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const tagName = node.tagName.toLowerCase();
  const attributes = Array.from(node.attributes)
    .map((attribute) => ` ${attribute.name}="${attribute.value.replaceAll('"', "&quot;")}"`)
    .join("");
  const meaningfulChildren = Array.from(node.childNodes).filter((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      return (child.textContent ?? "").trim() !== "";
    }

    return child.nodeType === Node.ELEMENT_NODE;
  });

  if (!meaningfulChildren.length) {
    return `${indent}<${tagName}${attributes}></${tagName}>`;
  }

  const hasElementChild = meaningfulChildren.some((child) => child.nodeType === Node.ELEMENT_NODE);
  const hasTextChild = meaningfulChildren.some((child) => child.nodeType === Node.TEXT_NODE);

  if (!hasElementChild && meaningfulChildren.length === 1) {
    return `${indent}<${tagName}${attributes}>${(meaningfulChildren[0].textContent ?? "").trim()}</${tagName}>`;
  }

  if (hasElementChild && hasTextChild) {
    return `${indent}${node.outerHTML}`;
  }

  const childLines = meaningfulChildren
    .map((child) => formatDomNodeAsHtml(child, depth + 1))
    .filter(Boolean)
    .join("\n");

  return `${indent}<${tagName}${attributes}>\n${childLines}\n${indent}</${tagName}>`;
}

/**
 * Replace generated asset URLs with readable placeholders before showing code.
 */
function prepareDomForCodeEditor(root) {
  const preparedRoot = root.cloneNode(true);
  const title = preparedRoot.querySelector("h1, h2, h3, h4")?.textContent?.trim() ?? "수사 보드";
  const theme = preparedRoot.getAttribute("data-theme") ?? "mint";
  const badge = preparedRoot.querySelector(".sample-badge")?.textContent?.trim() ?? "";

  preparedRoot.querySelectorAll(".suspect-card[data-suspect]").forEach((card) => {
    const slot = card.getAttribute("data-suspect") ?? "a";
    const image = card.querySelector("img");
    const name = card.querySelector("strong")?.textContent?.trim() ?? `용의자 ${slot.toUpperCase()}`;

    if (!image) {
      return;
    }

    const token = image.dataset.photoInput ?? "";

    if (!token) {
      image.setAttribute("src", `auto-suspect-${slot}`);
      image.dataset.photoInput = "";
      image.alt = `${name} 기본 수배 사진`;
    }
  });

  const evidenceImage = preparedRoot.querySelector(".evidence-photo__image");

  if (evidenceImage) {
    evidenceImage.setAttribute("src", "auto-evidence-image");
    evidenceImage.setAttribute("alt", `${title} 자동 생성 증거 이미지`);
  }

  const stamp = preparedRoot.querySelector(".case-board__stamp");
  if (stamp && !stamp.textContent?.trim()) {
    stamp.textContent = theme === "berry" ? "긴급 추적" : "증거 검토";
  }

  const evidenceCaption = preparedRoot.querySelector(".evidence-photo__caption");
  if (evidenceCaption && !evidenceCaption.textContent?.trim()) {
    evidenceCaption.textContent = `${badge || "추적 중"} 상태에서 먼저 확인할 증거 메모`;
  }

  return preparedRoot;
}

/**
 * Convert a VDOM tree into editable HTML text.
 */
function formatVdomAsDirectCode(vdom) {
  const root = vdomToDom(cloneVdom(vdom));

  if (!root) {
    return "";
  }

  return formatDomNodeAsHtml(prepareDomForCodeEditor(root));
}

/**
 * Keep the direct code editor synchronized with the current candidate board.
 */
function syncDirectCodeEditorFromVdom(vdom, message = "현재 수사 보드 HTML을 코드 섹션에 맞춰 갱신했습니다.") {
  if (!directCodeEditor) {
    return;
  }

  directCodeEditor.value = formatVdomAsDirectCode(vdom);
  setDirectCodeMessage(true, message);
}

/**
 * Normalize HTML from the direct code editor so the board can render safely.
 */
function normalizeRootFromDirectCode(root) {
  const theme = root.getAttribute("data-theme") ?? "mint";
  const title = root.querySelector("h1, h2, h3, h4")?.textContent?.trim() ?? "수사 보드";
  const badge = root.querySelector(".sample-badge")?.textContent?.trim() ?? "";

  root.querySelectorAll(".suspect-card[data-suspect]").forEach((card) => {
    const slot = card.getAttribute("data-suspect") ?? "a";
    const image = card.querySelector("img");
    const name = card.querySelector("strong")?.textContent?.trim() ?? `용의자 ${slot.toUpperCase()}`;

    if (!image) {
      return;
    }

    const source = image.getAttribute("src")?.trim() ?? "";

    if (!source || source === `auto-suspect-${slot}`) {
      image.setAttribute("src", createDefaultSuspectPhoto(name, slot, theme));
      image.dataset.photoInput = "";
    } else {
      image.dataset.photoInput = source;
    }

    image.setAttribute("alt", `${name} 용의자 사진`);
  });

  const evidenceImage = root.querySelector(".evidence-photo__image");
  if (evidenceImage) {
    const source = evidenceImage.getAttribute("src")?.trim() ?? "";

    if (!source || source === "auto-evidence-image") {
      evidenceImage.setAttribute("src", createEvidencePhoto(title, badge, theme));
    }

    evidenceImage.setAttribute("alt", `${title} 핵심 증거 이미지`);
  }

  return root;
}

/**
 * Validate and convert raw HTML from the direct code editor.
 */
function validateDirectCodeEditorValue(source) {
  if (!source.trim()) {
    return {
      valid: false,
      message: "index 코드 입력칸이 비어 있습니다. 수사 보드 루트 HTML을 1개 이상 넣어야 합니다.",
      vdom: null
    };
  }

  const parsedDocument = new DOMParser().parseFromString(source, "text/html");
  const meaningfulNodes = Array.from(parsedDocument.body.childNodes).filter(isMeaningfulTopLevelNode);

  if (meaningfulNodes.length !== 1 || meaningfulNodes[0].nodeType !== Node.ELEMENT_NODE) {
    return {
      valid: false,
      message: "index 코드 섹션에는 맨 바깥 루트 태그를 1개만 남겨야 합니다.",
      vdom: null
    };
  }

  const normalizedRoot = normalizeRootFromDirectCode(meaningfulNodes[0]);
  const nextVdom = domToVdom(normalizedRoot);

  if (!nextVdom) {
    return {
      valid: false,
      message: "index 코드에서 가설 보드를 읽어오지 못했습니다.",
      vdom: null
    };
  }

  return {
    valid: true,
    message: "index 코드 기준으로 가설 보드를 다시 계산했습니다.",
    vdom: nextVdom
  };
}

/**
 * Apply a validated draft VDOM to the preview workflow no matter which editor produced it.
 */
function applyDraftValidation(validation, reason, source = "form") {
  currentValidation = validation;
  clearHighlightsInFrame("actual");

  if (validation.valid) {
    pendingPatches = diff(currentVDOM, validation.vdom);

    renderSnapshotInFrame("preview", validation.vdom, pendingPatches);
    renderVdomPreview(validation.vdom, `[미리보기] ${reason}`);
    setValidationMessage(true, validation.message);

    if (source === "form") {
      syncDirectCodeEditorFromVdom(validation.vdom, "구조화 입력 기준으로 index 코드 섹션을 다시 맞췄습니다.");
    } else {
      setDirectCodeMessage(true, validation.message);
    }

    if (pendingPatches.length > 0) {
      renderChangeSummary("pending", {
        patches: pendingPatches,
        validation,
        nextVdom: validation.vdom,
        oldVDOM: currentVDOM
      });
      renderPatchLog("미리보기 준비 완료", pendingPatches, [
        `[미리보기] ${reason}`,
        "[안내] 아직 현재 수사 보드에는 반영되지 않았습니다."
      ]);
      updateStatus("비교 완료");
    } else {
      renderChangeSummary("synced", {
        validation,
        nextVdom: validation.vdom
      });
      renderPatchLog("변화 없음", [], [
        `[미리보기] ${reason}`,
        "[안내] 현재 수사 보드와 가설 보드가 동일합니다."
      ]);
      updateStatus("변경 없음");
    }
  } else {
    pendingPatches = [];
    renderPreviewPlaceholder(validation.message);
    renderVdomPreview(currentVDOM, `[검증] ${validation.message}`);
    setValidationMessage(false, validation.message);

    if (source === "code") {
      setDirectCodeMessage(false, validation.message);
    } else {
      setDirectCodeMessage(false, "구조화 입력이 아직 완전하지 않아 마지막 정상 index HTML을 유지하고 있습니다.");
    }

    renderChangeSummary("invalid", { validation });
    renderPatchLog("미리보기 중단", [], [`[이유] ${validation.message}`]);
    updateStatus("입력 오류");
  }

  updateButtonState();
  return validation;
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
    .filter((value) => Boolean(value) && value !== EMPTY_CLUE_LABEL)
    .join("\n");
  rootTagField.value = root.tagName.toLowerCase();
  themeField.value = root.getAttribute("data-theme") ?? "mint";
  badgeField.value = root.querySelector(".sample-badge")?.textContent?.trim() ?? "";
  suspectOneNameField.value = root.querySelector(".suspect-card[data-suspect='a'] strong")?.textContent?.trim() ?? "";
  writePhotoToken(suspectOnePhotoField, root.querySelector(".suspect-card[data-suspect='a'] img")?.dataset.photoInput ?? "");
  suspectOneNoteField.value = root.querySelector(".suspect-card[data-suspect='a'] p")?.textContent?.trim() ?? "";
  suspectTwoNameField.value = root.querySelector(".suspect-card[data-suspect='b'] strong")?.textContent?.trim() ?? "";
  writePhotoToken(suspectTwoPhotoField, root.querySelector(".suspect-card[data-suspect='b'] img")?.dataset.photoInput ?? "");
  suspectTwoNoteField.value = root.querySelector(".suspect-card[data-suspect='b'] p")?.textContent?.trim() ?? "";
  refreshPhotoControls();
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

  const stamp = root.querySelector(".case-board__stamp");
  if (stamp) {
    stamp.textContent = values.theme === "berry" ? "긴급 추적" : "증거 검토";
  }

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
    ensureClueListHasVisibleState(list);
  }

  const badge = root.querySelector(".sample-badge");
  if (badge) {
    badge.textContent = values.badge;
  }

  values.suspects.forEach((suspect, index) => {
    const suspectNode = root.querySelector(`.suspect-card[data-suspect='${suspect.slot}']`);
    const suspectImage = suspectNode?.querySelector("img");
    const suspectName = suspectNode?.querySelector("strong");
    const suspectNote = suspectNode?.querySelector("p");

    if (suspectName) {
      suspectName.textContent = suspect.name;
    }

    if (suspectNote) {
      suspectNote.textContent = suspect.note;
    }

    if (suspectImage) {
      suspectImage.src = resolvePhotoSource(suspect.photo, suspect.name, suspect.slot, values.theme);
      suspectImage.alt = `${suspect.name} 용의자 사진`;
      suspectImage.dataset.photoInput = suspect.photo;
    }

    suspectNode?.classList.toggle("suspect-card--primary", index === 0);
  });

  const evidenceImage = root.querySelector(".evidence-photo__image");
  if (evidenceImage) {
    evidenceImage.src = createEvidencePhoto(values.title, values.badge, values.theme);
    evidenceImage.alt = `${values.title} 핵심 증거 이미지`;
  }

  const evidenceCaption = root.querySelector(".evidence-photo__caption");
  if (evidenceCaption) {
    evidenceCaption.textContent = `${values.badge || "추적 중"} 상태에서 가장 먼저 확인해야 할 증거를 우선 표시했습니다.`;
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
      message: "사건명을 먼저 입력해야 가설 보드를 만들 수 있습니다.",
      vdom: null
    };
  }

  if (!values.description) {
    return {
      valid: false,
      message: "수사 메모를 입력해야 가설 보드를 만들 수 있습니다.",
      vdom: null
    };
  }

  const hasInvalidSuspect = values.suspects.some((suspect) => !suspect.name || !suspect.note);

  if (hasInvalidSuspect) {
    return {
      valid: false,
      message: "용의자 이름과 메모는 모두 입력해야 합니다.",
      vdom: null
    };
  }

  const nextVdom = buildVdomFromEditor(values);

  if (!nextVdom) {
    return {
      valid: false,
      message: "입력 기록을 비교용 가설 보드로 바꾸지 못했습니다.",
      vdom: null
    };
  }

  return {
    valid: true,
    message: `사건명 "${values.title}"이 들어간 가설 보드를 준비했습니다.`,
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
        text: "현재 수사 보드와 가설 보드가 같은 정규화 상태입니다."
      },
      {
        title: "다음 행동",
        text: "수사 기록을 수정하거나 프리셋 시나리오를 눌러 새로운 단서를 만들어 보세요."
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
 * Build a detached DOM root from the latest candidate board when possible.
 */
function buildEditableRootFromScenarioBase() {
  const baseVdom = currentValidation.valid && currentValidation.vdom ? currentValidation.vdom : currentVDOM;

  if (baseVdom) {
    return vdomToDom(cloneVdom(baseVdom));
  }

  return initialCardTemplate?.content?.firstElementChild?.cloneNode(true) ?? null;
}

/**
 * Return the next scenario item that is not already present.
 */
function getNextSampleItem(existingLabels) {
  const candidates = [
    { key: "glove", label: "찢어진 장갑 발견" },
    { key: "ticket", label: "찢긴 입장권 확보" },
    { key: "mirror", label: "깨진 거울 파편 수거" },
    { key: "note", label: "익명 쪽지 도착" }
  ];

  return candidates.find((item) => !existingLabels.has(item.label)) ?? {
    key: `sample-${existingLabels.size + 1}`,
    label: `새 단서 메모 ${existingLabels.size + 1}개`
  };
}

/**
 * Keep one visible empty-state clue card when no real clues remain.
 */
function ensureClueListHasVisibleState(list) {
  if (!list) {
    return;
  }

  const realItems = Array.from(list.children).filter((item) => item.getAttribute("data-item") !== EMPTY_CLUE_KEY);

  if (realItems.length > 0) {
    list.querySelector(`[data-item='${EMPTY_CLUE_KEY}']`)?.remove();
    return;
  }

  if (!list.querySelector(`[data-item='${EMPTY_CLUE_KEY}']`)) {
    const placeholder = document.createElement("li");
    placeholder.setAttribute("data-item", EMPTY_CLUE_KEY);
    placeholder.setAttribute("data-empty-state", "true");
    placeholder.textContent = EMPTY_CLUE_LABEL;
    list.appendChild(placeholder);
  }
}

/**
 * Build a presenter-friendly draft VDOM from the current actual DOM.
 */
function buildScenarioDraft(kind) {
  const candidateRoot = buildEditableRootFromScenarioBase();

  if (kind === "sync") {
    return {
      vdom: cloneVdom(currentVDOM),
      message: "현재 수사 보드를 다시 기준점으로 불러왔습니다. 누적된 가설 변경은 초기화됩니다."
    };
  }

  const root = candidateRoot;

  if (!root) {
    return {
      vdom: null,
      message: "가설 보드 기준점을 찾지 못했습니다."
    };
  }

  if (kind === "text") {
    const heading = root.querySelector("h1, h2, h3, h4");

    if (heading) {
      heading.textContent =
        heading.textContent === "붉은 열쇠 실종 사건"
          ? "푸른 회중시계 도난 사건"
          : "붉은 열쇠 실종 사건";
    }

    return {
      vdom: domToVdom(root),
      message: "현재 가설 보드에 사건명 변경을 추가했습니다."
    };
  }

  if (kind === "props") {
    const currentTheme = root.getAttribute("data-theme") ?? "mint";
    root.setAttribute("data-theme", currentTheme === "mint" ? "berry" : "mint");
    root.setAttribute("data-state", currentTheme === "mint" ? "compare" : "initial");
    root.classList.toggle("catalog-card--spotlight");
    root.querySelector(".case-board__stamp").textContent =
      currentTheme === "mint" ? "긴급 추적" : "증거 검토";
    root.querySelector(".sample-badge").textContent =
      currentTheme === "mint" ? "용의자 압축" : "추적 중";

    return {
      vdom: domToVdom(root),
      message: "현재 가설 보드에 긴급도 변경을 추가했습니다."
    };
  }

  if (kind === "add") {
    const list = root.querySelector("ul, ol");

    if (list) {
      list.querySelector(`[data-item='${EMPTY_CLUE_KEY}']`)?.remove();
      const existingLabels = new Set(
        Array.from(list.children)
          .map((item) => item.textContent?.trim() ?? "")
          .filter(Boolean)
      );
      const nextItem = getNextSampleItem(existingLabels);
      const newItem = document.createElement("li");

      newItem.setAttribute("data-item", nextItem.key);
      newItem.textContent = nextItem.label;
      list.appendChild(newItem);
    }

    return {
      vdom: domToVdom(root),
      message: "현재 가설 보드에 단서 카드 1개를 더했습니다."
    };
  }

  if (kind === "remove") {
    const removableItem = root.querySelector("ul li:last-child, ol li:last-child");

    if (removableItem && removableItem.getAttribute("data-item") !== EMPTY_CLUE_KEY) {
      removableItem.remove();
    }

    ensureClueListHasVisibleState(root.querySelector("ul, ol"));

    return {
      vdom: domToVdom(root),
      message: removableItem && removableItem.getAttribute("data-item") !== EMPTY_CLUE_KEY
        ? "현재 가설 보드에서 단서 카드 1개를 줄였습니다."
        : "단서가 모두 비어 있어 빈 단서 메모 상태로 유지했습니다."
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
    message: `현재 가설 보드에 보드 태그 변경(<${replacementTag}>)을 추가했습니다.`
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
  const validation = refreshPreviewFromEditor(`${scenarioLabels[kind]} 시나리오를 현재 가설 보드에 누적 적용했습니다.`);
  updateStatus(validation.valid ? "시나리오 초안 준비" : "입력 오류");
}

/**
 * Rebuild the candidate VDOM from the structured editor and refresh the preview panel.
 */
function refreshPreviewFromEditor(reason = "입력 기록 기준으로 가설 보드를 다시 계산했습니다.") {
  refreshPhotoControls();
  const validation = validateEditorValues(getEditorValues());
  return applyDraftValidation(validation, reason, "form");
}

/**
 * Rebuild the candidate VDOM from direct HTML code.
 */
function refreshPreviewFromDirectCode(reason = "index 코드 기준으로 가설 보드를 다시 계산했습니다.") {
  const validation = validateDirectCodeEditorValue(directCodeEditor?.value ?? "");

  if (validation.valid) {
    syncEditorFieldsFromVdom(validation.vdom);
  }

  return applyDraftValidation(validation, reason, "code");
}

/**
 * Sync actual area, preview area, and structured editor from a VDOM snapshot.
 */
function syncBothAreasFromVdom(vdom) {
  const snapshot = cloneVdom(vdom);

  renderSnapshotInFrame("actual", snapshot);
  renderSnapshotInFrame("preview", snapshot);
  syncEditorFieldsFromVdom(snapshot);
  refreshPhotoControls();
  syncDirectCodeEditorFromVdom(snapshot, "현재 이력 상태 기준으로 index 코드 섹션을 다시 맞췄습니다.");

  currentValidation = {
    valid: true,
    message: "현재 수사 보드와 가설 보드, 입력 기록을 현재 이력 상태로 다시 맞췄습니다.",
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
  const validation = refreshPreviewFromEditor("반영 직전 가설 보드를 다시 계산했습니다.");

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
      "[안내] 현재 입력 기록으로 만든 가설 보드가 실제 수사 보드 상태와 동일합니다."
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
    message: `${patches.length}개의 반영 작업을 현재 수사 보드에 적용했습니다.`,
    vdom: cloneVdom(nextVdom)
  };

  renderSnapshotInFrame("preview", nextVdom, patches);

  renderPatchLog("반영 완료", patches, [
    droppedRedoCount > 0
      ? `[이력] ${droppedRedoCount}개의 다음 보드를 정리하고 새 가설 보드를 저장했습니다.`
      : "[이력] 새 가설 보드를 마지막 위치에 저장했습니다.",
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
  updateStatus("보드 반영 완료");
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
    "[동기화] 저장된 이전 보드를 기준으로 현재 보드와 가설 보드를 다시 렌더했습니다."
  ]);
  updateStatus("이전 보드 복원");
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
    "[동기화] 저장된 다음 보드를 기준으로 현재 보드와 가설 보드를 다시 렌더했습니다."
  ]);
  updateStatus("다음 보드 복원");
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
  scenarioMessage.textContent = "초기 사건 보드와 이력을 다시 시작했습니다.";
  renderPatchLog("초기 사건 복원 완료", [], [
    "[상태] 초기 사건 보드로 되돌렸습니다.",
    "[이력] 초기 사건으로 버튼은 이력을 시작 지점 1개 상태로 다시 맞춥니다."
  ]);
  updateStatus("초기 사건 복원");
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
    "[초기화] 현재 수사 보드 DOM을 읽어 정규화된 가상 DOM으로 맞췄습니다.",
    "[다음 단계] 시나리오 버튼이나 입력 기록을 사용해 오른쪽 가설 보드를 먼저 바꿔 보세요."
  ]);
  scenarioMessage.textContent = "프리셋 시나리오 또는 입력 기록 수정으로 다음 가설 보드를 만들어 보세요.";
  updateStatus("설명 준비 완료");
}

/**
 * Boot the app after both embedded pages are ready.
 */
async function bootstrap() {
  initializeEmbeddedSites();
  await waitForEmbeddedPages();

  [
    titleField,
    descriptionField,
    itemsField,
    badgeField,
    suspectOneNameField,
    suspectOnePhotoField,
    suspectOneNoteField,
    suspectTwoNameField,
    suspectTwoPhotoField,
    suspectTwoNoteField
  ].forEach((field) => {
    field.addEventListener("input", () => {
      if (field === suspectOnePhotoField || field === suspectTwoPhotoField) {
        delete field.dataset.photoMode;
        delete field.dataset.photoValue;
      }
      refreshPreviewFromEditor("입력 기록 수정으로 가설 보드를 다시 계산했습니다.");
    });
  });

  [rootTagField, themeField].forEach((field) => {
    field.addEventListener("change", () => {
      refreshPreviewFromEditor("선택 항목 변경으로 가설 보드를 다시 계산했습니다.");
    });
  });

  directCodeEditor?.addEventListener("input", () => {
    refreshPreviewFromDirectCode("index 코드 수정으로 가설 보드를 다시 계산했습니다.");
  });

  Object.entries(suspectPhotoControls).forEach(([slot, control]) => {
    control.file.addEventListener("change", () => {
      const [file] = Array.from(control.file.files ?? []);

      if (!file) {
        return;
      }

      const reader = new FileReader();
      reader.addEventListener("load", () => {
        writePhotoToken(control.field, typeof reader.result === "string" ? reader.result : "");
        control.file.value = "";
        refreshPreviewFromEditor("업로드한 용의자 사진으로 가설 보드를 다시 계산했습니다.");
      });
      reader.readAsDataURL(file);
    });
  });

  photoResetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const control = suspectPhotoControls[button.dataset.photoReset];

      if (!control) {
        return;
      }

      writePhotoToken(control.field, "");
      refreshPreviewFromEditor("기본 수배 사진으로 가설 보드를 다시 계산했습니다.");
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
