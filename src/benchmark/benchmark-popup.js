/**
 * 벤치마크 팝업 — DOM vs VDOM 시각 비교 모듈
 *
 * 목표:
 * - 숫자만 비교하는 팝업이 아니라, 같은 "사이트"가 두 방식으로 갱신되는 장면을 보여준다.
 * - DOM 쪽은 전체를 다시 그리는 비용을, VDOM 쪽은 바뀐 부분만 반영하는 흐름을 시각적으로 드러낸다.
 * - 발표 모드에서는 실제 측정을 기반으로 차이를 보기 쉽게 확대하고, 실측 모드에서는 연출을 줄인다.
 */

import { vdomToDom } from "../vdom.js";
import { densityOptions, scenarios } from "./scenarios.js";
import { vdomToDomMapped } from "../optimized/vdom-mapped.js";
import { diffKeyed } from "../optimized/index.js";
import { applyPatchesMapped } from "../optimized/patch-mapped.js";

let overlayEl = null;
let keydownHandler = null;
let currentScenario = null;
let currentMode = "presentation";
let isRunning = false;
let domMetrics = null;
let vdomMetrics = null;
let preparedRun = null;

const refs = {};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function countNodes(vnode) {
  if (!vnode) return 0;
  if (vnode.type === "#text") return 1;
  return 1 + (vnode.children ?? []).reduce((total, child) => total + countNodes(child), 0);
}

function summarizePatches(patches) {
  const summary = {
    total: 0,
    add: 0,
    remove: 0,
    replace: 0,
    props: 0,
    text: 0,
  };

  for (const patch of patches ?? []) {
    summary.total += 1;
    switch (patch.type) {
      case "ADD":
        summary.add += 1;
        break;
      case "REMOVE":
        summary.remove += 1;
        break;
      case "REPLACE":
        summary.replace += 1;
        break;
      case "PROPS_UPDATE":
        summary.props += 1;
        break;
      case "TEXT_UPDATE":
        summary.text += 1;
        break;
    }
  }

  return summary;
}

function formatPatchSummary(summary) {
  const parts = [];

  if (summary.add) parts.push(`추가 ${summary.add}`);
  if (summary.remove) parts.push(`제거 ${summary.remove}`);
  if (summary.replace) parts.push(`교체 ${summary.replace}`);
  if (summary.props) parts.push(`속성 ${summary.props}`);
  if (summary.text) parts.push(`텍스트 ${summary.text}`);

  return parts.length ? parts.join(" · ") : "차이 없음";
}

function findHighlightHost(node) {
  let current = node;

  if (current?.nodeType === Node.TEXT_NODE) {
    current = current.parentElement;
  }

  if (!(current instanceof Element)) {
    return null;
  }

  return current.closest("[data-bench-id]") ?? current;
}

function collectPatchTargets(patches, nodeMap) {
  const updates = new Set();
  const removes = new Set();
  const addIds = new Set();
  const replaceIds = new Set();

  for (const patch of patches ?? []) {
    switch (patch.type) {
      case "TEXT_UPDATE":
      case "PROPS_UPDATE": {
        const target = findHighlightHost(patch._ref ? nodeMap.get(patch._ref) : null);
        if (target) updates.add(target);
        break;
      }

      case "REMOVE": {
        const target = findHighlightHost(patch._ref ? nodeMap.get(patch._ref) : null);
        if (target) removes.add(target);
        break;
      }

      case "REPLACE": {
        const existing = findHighlightHost(patch._ref ? nodeMap.get(patch._ref) : null);
        if (existing) updates.add(existing);
        const nextId = patch.node?.props?.["data-bench-id"];
        if (nextId) replaceIds.add(nextId);
        break;
      }

      case "ADD": {
        const nextId = patch.node?.props?.["data-bench-id"];
        if (nextId) addIds.add(nextId);
        break;
      }
    }
  }

  return { updates, removes, addIds, replaceIds };
}

function clearMarks(container) {
  container
    .querySelectorAll(".bench-mark--update, .bench-mark--add, .bench-mark--replace, .bench-mark--remove")
    .forEach((node) => {
      node.classList.remove("bench-mark--update", "bench-mark--add", "bench-mark--replace", "bench-mark--remove");
    });
}

function addMarks(elements, className) {
  elements.filter(Boolean).forEach((element) => element.classList.add(className));
}

function queryByBenchId(container, id) {
  return container.querySelector(`[data-bench-id="${id}"]`);
}

function buildPopupDOM() {
  const overlay = document.createElement("div");
  overlay.className = "bench-overlay";

  overlay.innerHTML = `
    <div class="bench-modal">
      <div class="bench-titlebar">
        <div>
          <span class="bench-titlebar__eyebrow">VISUAL BENCHMARK</span>
          <span class="bench-titlebar__title">DOM vs VDOM 체감 비교 무대</span>
        </div>
        <button class="bench-titlebar__close" aria-label="닫기">✕</button>
      </div>

      <div class="bench-toolbar">
        <div class="bench-scenarios">
          ${scenarios
            .map(
              (scenario, index) => `
                <button class="bench-scenario-btn${index === 0 ? " is-active" : ""}" data-scenario="${scenario.id}">
                  <span class="bench-scenario-btn__icon">${scenario.icon}</span>
                  <span>${scenario.name}</span>
                </button>
              `
            )
            .join("")}
        </div>

        <div class="bench-controls">
          <div class="bench-mode-switch" role="tablist" aria-label="벤치마크 모드">
            <button class="bench-mode-btn is-active" type="button" data-mode="presentation">발표 모드</button>
            <button class="bench-mode-btn" type="button" data-mode="measured">실측 모드</button>
          </div>

          <label class="bench-density-select">
            <span>노드 밀도</span>
            <select data-ref="densitySelect">
              ${densityOptions
                .map(
                  (option) => `
                    <option value="${option.value}"${option.value === "light" ? " selected" : ""}>
                      ${option.label} (${option.cards}장)
                    </option>
                  `
                )
                .join("")}
            </select>
          </label>

          <button class="bench-refresh-btn" type="button" data-ref="refreshRunBtn">새 데이터 받기</button>
        </div>
      </div>

      <div class="bench-guidance">
        <p class="bench-guidance__summary" data-ref="scenarioDesc"></p>
        <p class="bench-guidance__mode" data-ref="modeNote"></p>
      </div>

      <div class="bench-body">
        <section class="bench-panel bench-panel--dom">
          <div class="bench-panel__header">
            <div class="bench-panel__title-block">
              <span class="bench-panel__label">DOM 사이트</span>
              <p class="bench-panel__sublabel">변경이 생기면 사이트 전체를 다시 조립하는 쪽</p>
            </div>
            <span class="bench-status" data-ref="domStatus">대기 중</span>
            <span class="bench-timer" data-ref="domTimer">⏱ 준비</span>
            <button class="bench-run-btn bench-run-btn--dom" data-ref="domRunBtn">DOM만 실행</button>
          </div>

          <div class="bench-panel__facts">
            <span class="bench-fact" data-ref="domCost">전체 재구성 범위를 계산 중입니다.</span>
            <span class="bench-fact" data-ref="domScope">시나리오를 선택하면 예상 비용을 보여줍니다.</span>
          </div>

          <p class="bench-panel__story" data-ref="domStory"></p>

          <div class="bench-browser bench-browser--dom">
            <div class="bench-browser__bar">
              <div class="bench-browser__dots">
                <span class="bench-browser__dot bench-browser__dot--red"></span>
                <span class="bench-browser__dot bench-browser__dot--yellow"></span>
                <span class="bench-browser__dot bench-browser__dot--green"></span>
              </div>
              <span class="bench-browser__url">dom://full-refresh-stage</span>
            </div>

            <div class="bench-browser__stage">
              <div class="bench-browser__overlay" data-ref="domOverlay"></div>
              <div class="bench-browser__content" data-ref="domContent">
                <div class="bench-browser__placeholder">초기 장면을 준비 중입니다.</div>
              </div>
            </div>
          </div>
        </section>

        <section class="bench-panel bench-panel--vdom">
          <div class="bench-panel__header">
            <div class="bench-panel__title-block">
              <span class="bench-panel__label">VDOM 사이트</span>
              <p class="bench-panel__sublabel">바뀐 카드와 텍스트만 골라서 반영하는 쪽</p>
            </div>
            <span class="bench-status" data-ref="vdomStatus">대기 중</span>
            <span class="bench-timer" data-ref="vdomTimer">⏱ 준비</span>
            <button class="bench-run-btn bench-run-btn--vdom" data-ref="vdomRunBtn">VDOM만 실행</button>
          </div>

          <div class="bench-panel__facts">
            <span class="bench-fact" data-ref="vdomCost">예상 패치 개수를 계산 중입니다.</span>
            <span class="bench-fact" data-ref="vdomScope">시나리오를 선택하면 예상 패치를 보여줍니다.</span>
          </div>

          <p class="bench-panel__story" data-ref="vdomStory"></p>

          <div class="bench-browser bench-browser--vdom">
            <div class="bench-browser__bar">
              <div class="bench-browser__dots">
                <span class="bench-browser__dot bench-browser__dot--red"></span>
                <span class="bench-browser__dot bench-browser__dot--yellow"></span>
                <span class="bench-browser__dot bench-browser__dot--green"></span>
              </div>
              <span class="bench-browser__url">vdom://selective-patch-stage</span>
            </div>

            <div class="bench-browser__stage">
              <div class="bench-browser__overlay" data-ref="vdomOverlay"></div>
              <div class="bench-browser__content" data-ref="vdomContent">
                <div class="bench-browser__placeholder">초기 장면을 준비 중입니다.</div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="bench-result-bar">
        <button class="bench-run-both" data-ref="runBothBtn">⚡ 양쪽 동시에 비교</button>
        <div class="bench-result-bar__summary">
          <strong class="bench-result-bar__lead" data-ref="resultLead">같은 사이트를 두 방식으로 갱신해 차이를 눈으로 봅니다.</strong>
          <p class="bench-result-bar__text" data-ref="resultText">시나리오를 선택하고 실행하면 전체 재구성과 부분 패치 차이가 여기에 정리됩니다.</p>
        </div>
      </div>
    </div>
  `;

  return overlay;
}

function cacheRefs(overlay) {
  Object.keys(refs).forEach((key) => delete refs[key]);
  overlay.querySelectorAll("[data-ref]").forEach((element) => {
    refs[element.dataset.ref] = element;
  });
}

function setStatus(kind, message, state) {
  const statusEl = refs[`${kind}Status`];
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.classList.remove("is-running", "is-done", "is-idle");

  if (state === "running") statusEl.classList.add("is-running");
  if (state === "done") statusEl.classList.add("is-done");
  if (state === "idle") statusEl.classList.add("is-idle");
}

function setTimer(kind, message, done = false) {
  const timerEl = refs[`${kind}Timer`];
  if (!timerEl) return;
  timerEl.textContent = message;
  timerEl.classList.toggle("is-done", done);
}

function showOverlay(kind, message, tone) {
  const overlay = refs[`${kind}Overlay`];
  if (!overlay) return;

  overlay.textContent = message;
  overlay.dataset.tone = tone;
  overlay.classList.add("is-visible");
}

function hideOverlay(kind) {
  const overlay = refs[`${kind}Overlay`];
  if (!overlay) return;

  overlay.textContent = "";
  overlay.classList.remove("is-visible");
  overlay.removeAttribute("data-tone");
}

function renderInitialDOM(container, vnode) {
  container.replaceChildren();
  const dom = vdomToDom(vnode);
  container.appendChild(dom);
  return dom;
}

function getScenarioOptions() {
  return {
    density: refs.densitySelect.value,
  };
}

function buildScenarioTrees() {
  if (!preparedRun) {
    preparedRun = currentScenario.prepare(getScenarioOptions());
  }

  return preparedRun;
}

function invalidatePreparedRun() {
  preparedRun = null;
}

function prepareNewRun() {
  invalidatePreparedRun();
  return buildScenarioTrees();
}

function updateModeNote() {
  if (currentMode === "presentation") {
    refs.modeNote.textContent =
      "발표 모드: 실측 모드와 같은 계산 경로로 측정하고, 측정이 끝난 뒤에만 이해를 돕는 시각 효과를 얹습니다.";
    return;
  }

  refs.modeNote.textContent =
    "실측 모드: 추가 연출을 줄이고, 실제 계산과 반영 결과를 최대한 있는 그대로 보여줍니다.";
}

function setControlsLocked(locked) {
  overlayEl?.querySelectorAll(".bench-scenario-btn, .bench-mode-btn").forEach((button) => {
    button.disabled = locked;
  });

  if (refs.densitySelect) refs.densitySelect.disabled = locked;
  if (refs.refreshRunBtn) refs.refreshRunBtn.disabled = locked;
  if (refs.domRunBtn) refs.domRunBtn.disabled = locked;
  if (refs.vdomRunBtn) refs.vdomRunBtn.disabled = locked;
  if (refs.runBothBtn) refs.runBothBtn.disabled = locked;
}

function setMode(mode) {
  currentMode = mode;

  overlayEl?.querySelectorAll(".bench-mode-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode);
  });

  updateModeNote();
  primeScenarioViews(false);
}

function resetRuntimePanels() {
  domMetrics = null;
  vdomMetrics = null;

  setStatus("dom", "대기 중", "idle");
  setStatus("vdom", "대기 중", "idle");
  setTimer("dom", "⏱ 준비");
  setTimer("vdom", "⏱ 준비");

  hideOverlay("dom");
  hideOverlay("vdom");
  clearMarks(refs.domContent);
  clearMarks(refs.vdomContent);

  refs.resultLead.textContent = "같은 사이트를 두 방식으로 갱신해 차이를 눈으로 봅니다.";
  refs.resultText.textContent = "시나리오를 선택하고 실행하면 전체 재구성과 부분 패치 차이가 여기에 정리됩니다.";
}

function updateScenarioNarratives(run) {
  const { initialVdom, modifiedVdom, packet } = run;
  const totalNodes = countNodes(modifiedVdom);
  const expectedPatches = diffKeyed(initialVdom, modifiedVdom);
  const patchSummary = summarizePatches(expectedPatches);

  refs.scenarioDesc.textContent = `${currentScenario.description} 지금 준비된 수신 묶음은 "${packet.label}"이며 ${packet.receivedAt}에 도착한 데이터입니다.`;

  refs.domCost.textContent = `전체 ${totalNodes}개 노드를 다시 구성합니다.`;
  refs.domScope.textContent = packet.description;
  refs.domStory.textContent =
    `DOM 쪽은 "${packet.label}" 데이터를 받으면 보이는 변화가 일부뿐이어도 사이트 판 전체를 다시 조립합니다.`;

  refs.vdomCost.textContent = `예상 패치 ${patchSummary.total}개 · ${packet.changeCountText}`;
  refs.vdomScope.textContent = `${formatPatchSummary(patchSummary)} · ${packet.label}`;
  refs.vdomStory.textContent =
    `VDOM 쪽은 "${packet.label}"에서 달라진 카드·배지·텍스트만 골라 고칩니다.`;

  refs.resultLead.textContent = `현재 준비된 새 데이터: ${packet.label}`;
  refs.resultText.textContent = `${packet.description} (${packet.receivedAt} · ${packet.batchId})`;
}

function primeScenarioViews(forceNew = true) {
  if (!currentScenario) return;

  resetRuntimePanels();

  const run = forceNew ? prepareNewRun() : buildScenarioTrees();
  renderInitialDOM(refs.domContent, run.initialVdom);
  renderInitialDOM(refs.vdomContent, run.initialVdom);
  updateScenarioNarratives(run);
}

async function withBenchmarkLock(task) {
  if (isRunning) return;

  isRunning = true;
  setControlsLocked(true);

  try {
    await task();
  } finally {
    isRunning = false;
    setControlsLocked(false);
  }
}

async function performDOMBenchmark() {
  const run = buildScenarioTrees();
  const { initialVdom, modifiedVdom, packet } = run;
  const container = refs.domContent;
  const totalNodes = countNodes(modifiedVdom);

  clearMarks(container);
  hideOverlay("dom");
  renderInitialDOM(container, initialVdom);
  await nextPaint();

  refs.domStory.textContent =
    `DOM은 "${packet.label}" 묶음을 받으면 대표 이미지 한 장만 바뀌어 보여도 전체 사이트를 다시 만듭니다.`;
  refs.domCost.textContent = `전체 ${totalNodes}개 노드를 새로 만듭니다.`;
  refs.domScope.textContent = `이번 수신 데이터: ${packet.description}`;

  setStatus("dom", "전체 재구성 준비", "running");
  setTimer("dom", "⏱ 전체 다시 그리는 중…");

  if (currentMode === "presentation") {
    showOverlay("dom", `"${packet.label}" 수신 · 사이트 전체 갱신 중`, "dom");
    await sleep(220);
  }

  const t0 = performance.now();
  container.replaceChildren();
  container.appendChild(vdomToDom(modifiedVdom));
  void container.offsetHeight;
  const t1 = performance.now();

  domMetrics = {
    timeMs: t1 - t0,
    totalNodes,
  };

  if (currentMode === "presentation") {
    refs.domContent.classList.add("is-dom-refresh");
    await sleep(760);
    refs.domContent.classList.remove("is-dom-refresh");
    showOverlay("dom", `전체 ${totalNodes}개 노드 재구성 완료`, "done");
    await sleep(280);
    hideOverlay("dom");
  }

  setTimer("dom", `⏱ ${domMetrics.timeMs.toFixed(2)}ms`, true);
  setStatus("dom", "전체 재구성 완료", "done");
  updateResultBar();
}

async function performVDOMBenchmark() {
  const run = buildScenarioTrees();
  const { initialVdom, modifiedVdom, packet } = run;
  const container = refs.vdomContent;
  const nodeMap = new WeakMap();

  clearMarks(container);
  hideOverlay("vdom");
  container.replaceChildren();
  let rootNode = vdomToDomMapped(initialVdom, nodeMap);
  container.appendChild(rootNode);
  await nextPaint();

  if (currentMode === "presentation") {
    showOverlay("vdom", `"${packet.label}" 수신 · 부분 패치 계산 준비 중`, "vdom");
    await sleep(150);
  }

  setStatus("vdom", "부분 패치 계산 중", "running");
  setTimer("vdom", "⏱ 바뀐 부분만 계산 중…");

  const t0 = performance.now();
  const patches = diffKeyed(initialVdom, modifiedVdom);
  const diffEnd = performance.now();
  rootNode = applyPatchesMapped(rootNode, patches, nodeMap);
  void container.offsetHeight;
  const t1 = performance.now();

  const patchSummary = summarizePatches(patches);
  const targets = collectPatchTargets(patches, nodeMap);
  const diffTime = diffEnd - t0;
  const patchTime = t1 - diffEnd;

  vdomMetrics = {
    timeMs: t1 - t0,
    diffTime,
    patchTime,
    patchSummary,
  };

  const addedNodes = [...targets.addIds].map((id) => queryByBenchId(container, id)).filter(Boolean);
  const replacedNodes = [...targets.replaceIds].map((id) => queryByBenchId(container, id)).filter(Boolean);

  addMarks([...targets.updates], "bench-mark--update");
  addMarks(addedNodes, "bench-mark--add");
  addMarks(replacedNodes, "bench-mark--replace");

  refs.vdomCost.textContent = `실제 패치 ${patchSummary.total}개만 반영합니다.`;
  refs.vdomScope.textContent = `${formatPatchSummary(patchSummary)} · ${packet.label}`;
  refs.vdomStory.textContent =
    `VDOM은 "${packet.label}"에서 달라진 카드와 텍스트만 골라 실제 DOM에 반영합니다.`;

  if (currentMode === "presentation") {
    showOverlay("vdom", `${patchSummary.total}개 패치만 적용`, "done");
    await sleep(Math.max(360, Math.min(880, 180 + patchSummary.total * 32)));
    hideOverlay("vdom");
  }

  clearMarks(container);

  setTimer(
    "vdom",
    `⏱ ${vdomMetrics.timeMs.toFixed(2)}ms (diff ${vdomMetrics.diffTime.toFixed(2)} + patch ${vdomMetrics.patchTime.toFixed(2)})`,
    true
  );
  setStatus("vdom", "부분 패치 완료", "done");
  updateResultBar();
}

function updateResultBar() {
  if (!domMetrics && !vdomMetrics) {
    refs.resultLead.textContent = "같은 사이트를 두 방식으로 갱신해 차이를 눈으로 봅니다.";
    refs.resultText.textContent = "시나리오를 선택하고 실행하면 전체 재구성과 부분 패치 차이가 여기에 정리됩니다.";
    return;
  }

  if (!domMetrics || !vdomMetrics) {
    refs.resultLead.textContent = "한쪽 실행 결과만 도착했습니다.";
    refs.resultText.textContent = "양쪽 동시에 비교를 누르면 전체 재구성과 부분 패치를 한 번에 비교할 수 있습니다.";
    return;
  }

  const faster = domMetrics.timeMs > vdomMetrics.timeMs ? "VDOM" : "DOM";
  const ratio =
    faster === "VDOM"
      ? ((1 - vdomMetrics.timeMs / domMetrics.timeMs) * 100).toFixed(0)
      : ((1 - domMetrics.timeMs / vdomMetrics.timeMs) * 100).toFixed(0);

  refs.resultLead.textContent =
    `화면상 변화는 일부였지만, DOM은 전체 ${domMetrics.totalNodes}개 노드를 다시 구성했고 ` +
    `VDOM은 ${vdomMetrics.patchSummary.total}개 패치만 적용했습니다.`;

  refs.resultText.innerHTML =
    `DOM <span class="dom-time">${domMetrics.timeMs.toFixed(2)}ms</span> · 전체 재구성 / ` +
    `VDOM <span class="vdom-time">${vdomMetrics.timeMs.toFixed(2)}ms</span> · ` +
    `${formatPatchSummary(vdomMetrics.patchSummary)} ` +
    `<span class="comparison">→ ${faster}이 ${ratio}% 빠름</span>`;
}

function selectScenario(id) {
  const scenario = scenarios.find((candidate) => candidate.id === id);
  if (!scenario) return;

  currentScenario = scenario;
  invalidatePreparedRun();

  overlayEl?.querySelectorAll(".bench-scenario-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.scenario === id);
  });

  primeScenarioViews(true);
}

function closePopup() {
  if (!overlayEl) return;

  overlayEl.classList.remove("is-open");

  if (keydownHandler) {
    document.removeEventListener("keydown", keydownHandler);
    keydownHandler = null;
  }

  setTimeout(() => {
    overlayEl?.remove();
    overlayEl = null;
    Object.keys(refs).forEach((key) => delete refs[key]);
  }, 260);
}

async function runDOMBenchmark() {
  await withBenchmarkLock(async () => {
    resetRuntimePanels();
    await performDOMBenchmark();
  });
}

async function runVDOMBenchmark() {
  await withBenchmarkLock(async () => {
    resetRuntimePanels();
    await performVDOMBenchmark();
  });
}

async function runBothBenchmarks() {
  await withBenchmarkLock(async () => {
    resetRuntimePanels();
    await Promise.all([performDOMBenchmark(), performVDOMBenchmark()]);
  });
}

export function openBenchmarkPopup() {
  if (overlayEl) {
    overlayEl.classList.add("is-open");
    return;
  }

  overlayEl = buildPopupDOM();
  document.body.appendChild(overlayEl);
  cacheRefs(overlayEl);

  overlayEl.querySelector(".bench-titlebar__close").addEventListener("click", closePopup);
  overlayEl.addEventListener("click", (event) => {
    if (event.target === overlayEl) {
      closePopup();
    }
  });

  keydownHandler = (event) => {
    if (event.key === "Escape" && overlayEl) {
      closePopup();
    }
  };

  document.addEventListener("keydown", keydownHandler);

  overlayEl.querySelectorAll(".bench-scenario-btn").forEach((button) => {
    button.addEventListener("click", () => selectScenario(button.dataset.scenario));
  });

  overlayEl.querySelectorAll(".bench-mode-btn").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  refs.densitySelect.addEventListener("change", () => {
    invalidatePreparedRun();
    primeScenarioViews(true);
  });
  refs.refreshRunBtn.addEventListener("click", () => primeScenarioViews(true));
  refs.domRunBtn.addEventListener("click", runDOMBenchmark);
  refs.vdomRunBtn.addEventListener("click", runVDOMBenchmark);
  refs.runBothBtn.addEventListener("click", runBothBenchmarks);

  selectScenario(scenarios[0].id);
  updateModeNote();

  requestAnimationFrame(() => overlayEl?.classList.add("is-open"));
}
