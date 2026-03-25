/**
 * 벤치마크 팝업 — DOM vs VDOM 성능 비교 모듈
 *
 * 기존 index.html / main.js를 거의 수정하지 않고,
 * openBenchmarkPopup() 한 줄로 팝업을 열 수 있는 독립 모듈이다.
 */

import { vdomToDom, domToVdom, cloneVdom } from "../vdom.js";
import { diff } from "../diff.js";
import { applyPatches } from "../patch.js";
import { scenarios, estimateNodeCount, NODE_LIMIT } from "./scenarios.js";

// 최적화 모듈 (src/optimized/ 삭제 시 이 3줄 + runVDOMBenchmark 내부만 원복)
import { vdomToDomMapped } from "../optimized/vdom-mapped.js";
import { diffKeyed } from "../optimized/index.js";
import { applyPatchesMapped } from "../optimized/patch-mapped.js";

let overlayEl = null;
let currentScenario = null;
let isBenchmarkRunning = false;
let lastRunTime = 0; // 버튼 쿨다운용 (1.5초 인터벌)
const RUN_COOLDOWN_MS = 1500;

// 타이밍 결과 저장
let domTimeMs = null;
let vdomTimeMs = null;

// DOM 참조 캐시
const refs = {};

/**
 * 나이브 DOM 순회 갱신 — 프레임워크 없이 수동으로 DOM을 비교·갱신하는 방식.
 * 위치(index) 기반으로 기존 DOM 트리를 새 VDOM과 비교하고,
 * 다른 부분만 textContent/속성 변경, 노드 추가/삭제를 수행한다.
 * key 최적화 없음, MOVE 없음 — "순수 수동 DOM 조작"의 현실적 비용을 측정한다.
 */
function naiveDomUpdate(domNode, newVdom) {
  if (!domNode || !newVdom) return;

  // 텍스트 노드
  if (newVdom.type === "#text") {
    if (domNode.nodeType === 3) {
      if (domNode.textContent !== newVdom.text) {
        domNode.textContent = newVdom.text;
      }
    }
    return;
  }

  // 속성 갱신
  if (newVdom.props) {
    for (const [key, val] of Object.entries(newVdom.props)) {
      if (key === "key") continue;
      const strVal = String(val);
      if (domNode.getAttribute(key) !== strVal) {
        domNode.setAttribute(key, strVal);
      }
    }
  }

  // 자식 재귀 비교
  const existingChildren = domNode.childNodes;
  const newChildren = newVdom.children ?? [];
  const minLen = Math.min(existingChildren.length, newChildren.length);

  for (let i = 0; i < minLen; i++) {
    naiveDomUpdate(existingChildren[i], newChildren[i]);
  }

  // 부족한 자식 추가
  for (let i = existingChildren.length; i < newChildren.length; i++) {
    domNode.appendChild(vdomToDom(newChildren[i]));
  }

  // 초과 자식 제거
  while (domNode.childNodes.length > newChildren.length) {
    domNode.removeChild(domNode.lastChild);
  }
}

/* ────────────────────────────────
   팝업 DOM 생성
   ──────────────────────────────── */

function buildPopupDOM() {
  const overlay = document.createElement("div");
  overlay.className = "bench-overlay";

  overlay.innerHTML = `
    <div class="bench-modal">
      <div class="bench-titlebar">
        <span class="bench-titlebar__title">⚡ DOM vs VDOM 벤치마크</span>
        <button type="button" class="bench-titlebar__close" aria-label="닫기">✕</button>
      </div>

      <div class="bench-scenarios">
        ${scenarios
          .map(
            (s, i) =>
              `<button class="bench-scenario-btn${i === 0 ? " is-active" : ""}" data-scenario="${s.id}">
                ${s.icon} ${s.name}
              </button>`
          )
          .join("")}
        <span class="bench-scenario-desc" data-ref="scenarioDesc">${scenarios[0].description}</span>
      </div>

      <div class="bench-params" data-ref="paramsContainer"></div>

      <div class="bench-body">
        <!-- DOM 패널 -->
        <div class="bench-panel bench-panel--dom">
          <div class="bench-panel__header">
            <span class="bench-panel__label">DOM</span>
            <span class="bench-timer" data-ref="domTimer">⏱ 대기 중</span>
            <button type="button" class="bench-run-btn" data-ref="domRunBtn">▶ 실행</button>
            <span class="bench-panel__sublabel">수동 DOM 순회 — 위치 기반 비교 + 부분 갱신</span>
          </div>
          <div class="bench-browser">
            <div class="bench-browser__bar">
              <div class="bench-browser__dots">
                <span class="bench-browser__dot bench-browser__dot--red"></span>
                <span class="bench-browser__dot bench-browser__dot--yellow"></span>
                <span class="bench-browser__dot bench-browser__dot--green"></span>
              </div>
              <span class="bench-browser__url">dom://benchmark</span>
            </div>
            <div class="bench-browser__content" data-ref="domContent">
              <div class="bench-browser__placeholder">시나리오를 선택하고 실행하세요</div>
            </div>
          </div>
        </div>

        <!-- VDOM 패널 -->
        <div class="bench-panel bench-panel--vdom">
          <div class="bench-panel__header">
            <span class="bench-panel__label">VDOM</span>
            <span class="bench-timer" data-ref="vdomTimer">⏱ 대기 중</span>
            <button type="button" class="bench-run-btn" data-ref="vdomRunBtn">▶ 실행</button>
            <span class="bench-panel__sublabel">key diff + O(1) patch</span>
          </div>
          <div class="bench-browser">
            <div class="bench-browser__bar">
              <div class="bench-browser__dots">
                <span class="bench-browser__dot bench-browser__dot--red"></span>
                <span class="bench-browser__dot bench-browser__dot--yellow"></span>
                <span class="bench-browser__dot bench-browser__dot--green"></span>
              </div>
              <span class="bench-browser__url">vdom://benchmark</span>
            </div>
            <div class="bench-browser__content" data-ref="vdomContent">
              <div class="bench-browser__placeholder">시나리오를 선택하고 실행하세요</div>
            </div>
          </div>
        </div>
      </div>

      <div class="bench-result-bar">
        <button type="button" class="bench-run-both" data-ref="runBothBtn">⚡ 양쪽 동시 실행</button>
        <span class="bench-result-bar__text" data-ref="resultText"></span>
      </div>
    </div>
  `;

  return overlay;
}

function cacheRefs(overlay) {
  overlay.querySelectorAll("[data-ref]").forEach((el) => {
    refs[el.dataset.ref] = el;
  });
}

/* ────────────────────────────────
   파라미터 UI (Phase 4)
   ──────────────────────────────── */

function renderParamsUI(scenario) {
  const container = refs.paramsContainer;
  if (!scenario.params || scenario.params.length === 0) {
    container.innerHTML = "";
    container.classList.remove("has-params");
    return;
  }

  container.classList.add("has-params");
  container.innerHTML = scenario.params
    .map(
      (p) => `
      <label class="bench-param">
        <span class="bench-param__label">${p.label}</span>
        <input class="bench-param__input"
               type="number"
               data-param="${p.key}"
               value="${p.default}"
               min="${p.min}" max="${p.max}" step="${p.step}" />
      </label>`
    )
    .join("");

  // 노드 폭발 경고 영역 (deep-tree 시나리오용)
  if (scenario.estimateNodes) {
    const warn = document.createElement("span");
    warn.className = "bench-params__warning";
    warn.dataset.ref = "nodeWarning";
    container.appendChild(warn);
    refs.nodeWarning = warn;
    validateNodeCount(scenario);
  }

  // 파라미터 변경 시 유효성 검사 + 클램핑
  container.querySelectorAll(".bench-param__input").forEach((input) => {
    input.addEventListener("change", () => {
      const p = scenario.params.find((pp) => pp.key === input.dataset.param);
      if (!p) return;
      let v = Number(input.value);
      if (isNaN(v) || v < p.min) v = p.min;
      if (v > p.max) v = p.max;
      input.value = v;
      if (scenario.estimateNodes) validateNodeCount(scenario);
    });
    input.addEventListener("input", () => {
      if (scenario.estimateNodes) validateNodeCount(scenario);
    });
  });
}

function getCurrentParams(scenario) {
  const params = {};
  if (!scenario.params) return params;
  for (const p of scenario.params) {
    const input = refs.paramsContainer.querySelector(`[data-param="${p.key}"]`);
    let val = input ? Number(input.value) : p.default;
    if (isNaN(val)) val = p.default;
    // 음수 방지 + 최소/최대 클램핑 (숫자 최소 10, 비율은 시나리오 min 준수)
    val = Math.max(p.min, Math.min(p.max, val));
    params[p.key] = val;
  }
  return params;
}

function validateNodeCount(scenario) {
  const params = getCurrentParams(scenario);
  const nodeCount = scenario.estimateNodes(params);
  const warning = refs.nodeWarning;
  const runButtons = [refs.domRunBtn, refs.vdomRunBtn, refs.runBothBtn];

  // 비율 파라미터 100% 초과 경고 (changeRatio, deleteRatio 등)
  const ratioParam = scenario.params?.find((p) => p.key.endsWith("Ratio"));
  if (ratioParam) {
    const input = refs.paramsContainer.querySelector(`[data-param="${ratioParam.key}"]`);
    if (input && Number(input.value) > ratioParam.max) {
      warning.textContent = `⚠️ ${ratioParam.label}은(는) ${ratioParam.max}%를 초과할 수 없습니다`;
      warning.classList.add("is-over-limit");
      runButtons.forEach((b) => (b.disabled = true));
      return;
    }
  }

  if (nodeCount > NODE_LIMIT) {
    const formatted = nodeCount.toLocaleString();
    warning.textContent = `⚠️ 예상 노드 수 ${formatted}개 (한도: ${NODE_LIMIT.toLocaleString()}) — 실행 불가`;
    warning.classList.add("is-over-limit");
    runButtons.forEach((b) => (b.disabled = true));
  } else {
    const formatted = nodeCount.toLocaleString();
    warning.textContent = `노드 수: ~${formatted}`;
    warning.classList.remove("is-over-limit");
    runButtons.forEach((b) => (b.disabled = false));
  }
}

/* ────────────────────────────────
   벤치마크 실행 로직
   ──────────────────────────────── */

function renderInitialDOM(container, vdom) {
  container.replaceChildren();
  const dom = vdomToDom(vdom);
  container.appendChild(dom);
}

/**
 * DOM 방식 벤치마크: 수동 DOM 순회 + 부분 갱신 (공정 비교)
 * 기존 DOM 트리를 새 VDOM과 위치 기반으로 비교하여 다른 부분만 수정한다.
 * key 최적화 없음 — 프레임워크 없는 "수동 DOM 조작"의 현실적 비용.
 */
async function runDOMBenchmark() {
  const now = Date.now();
  if (!currentScenario || isBenchmarkRunning || now - lastRunTime < RUN_COOLDOWN_MS) return;
  isBenchmarkRunning = true;
  lastRunTime = now;

  const btn = refs.domRunBtn;
  const timer = refs.domTimer;
  const container = refs.domContent;

  btn.classList.add("is-running");
  btn.disabled = true;
  timer.textContent = "⏱ 초기화 중…";
  timer.classList.remove("is-done");

  const params = getCurrentParams(currentScenario);
  const initialVdom = currentScenario.generateInitial(params);
  const modifiedVdom = currentScenario.generateModified(params);

  // 초기 렌더링 (측정 대상 아님)
  renderInitialDOM(container, initialVdom);

  // 한 프레임 대기하여 브라우저가 초기 렌더링을 완료하도록
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  timer.textContent = "⏱ 측정 중…";

  // 나이브 DOM 순회: 기존 DOM과 새 VDOM을 위치 기반으로 비교·갱신
  const t0 = performance.now();
  const rootDom = container.firstChild;
  if (rootDom) {
    naiveDomUpdate(rootDom, modifiedVdom);
  }

  // 강제 리플로우를 유발하여 실제 렌더링 비용 포함
  void container.offsetHeight;
  const t1 = performance.now();

  domTimeMs = t1 - t0;

  timer.textContent = `⏱ ${domTimeMs.toFixed(2)}ms (수동 순회)`;
  timer.classList.add("is-done");
  btn.classList.remove("is-running");
  btn.disabled = false;
  isBenchmarkRunning = false;

  updateResultBar();
}

/**
 * VDOM 방식 벤치마크: key 기반 diff + Map O(1) patch
 * (src/optimized/ 모듈 사용)
 */
async function runVDOMBenchmark() {
  const now = Date.now();
  if (!currentScenario || isBenchmarkRunning || now - lastRunTime < RUN_COOLDOWN_MS) return;
  isBenchmarkRunning = true;
  lastRunTime = now;

  const btn = refs.vdomRunBtn;
  const timer = refs.vdomTimer;
  const container = refs.vdomContent;

  btn.classList.add("is-running");
  btn.disabled = true;
  timer.textContent = "⏱ 초기화 중…";
  timer.classList.remove("is-done");

  const params = getCurrentParams(currentScenario);
  const initialVdom = currentScenario.generateInitial(params);
  const modifiedVdom = currentScenario.generateModified(params);

  // 초기 렌더링 — vdomToDomMapped로 WeakMap 동시 구축 (측정 대상 아님)
  const nodeMap = new WeakMap();
  container.replaceChildren();
  let rootNode = vdomToDomMapped(initialVdom, nodeMap);
  container.appendChild(rootNode);

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  timer.textContent = "⏱ 측정 중…";

  // ① diff: key 기반 비교 + _ref 첨부
  const t0 = performance.now();
  const patches = diffKeyed(initialVdom, modifiedVdom);
  const td1 = performance.now();

  // ② patch: WeakMap O(1) 조회로 DOM 수정
  rootNode = applyPatchesMapped(rootNode, patches, nodeMap);
  const tp1 = performance.now();

  // 강제 리플로우
  void container.offsetHeight;
  const tEnd = performance.now();

  const diffTime = td1 - t0;
  const patchTime = tp1 - td1;
  vdomTimeMs = tEnd - t0;

  timer.textContent =
    `⏱ ${vdomTimeMs.toFixed(2)}ms` +
    ` (diff ${diffTime.toFixed(2)} + patch ${patchTime.toFixed(2)})` +
    ` · ${patches.length}건`;
  timer.classList.add("is-done");
  btn.classList.remove("is-running");
  btn.disabled = false;
  isBenchmarkRunning = false;

  updateResultBar();
}

async function runBothBenchmarks() {
  if (isBenchmarkRunning) return;
  refs.runBothBtn.disabled = true;
  domTimeMs = null;
  vdomTimeMs = null;
  refs.resultText.textContent = "";

  // 쿨다운 무시하고 순차 실행 (내부에서 직접 lastRunTime 설정)
  lastRunTime = 0;
  await runDOMBenchmark();
  lastRunTime = 0;
  await runVDOMBenchmark();

  refs.runBothBtn.disabled = false;
}

function updateResultBar() {
  if (domTimeMs == null || vdomTimeMs == null) {
    refs.resultText.innerHTML = "";
    return;
  }

  const faster = domTimeMs > vdomTimeMs ? "VDOM" : "DOM";
  let ratio =
    faster === "VDOM"
      ? (1 - vdomTimeMs / domTimeMs) * 100
      : (1 - domTimeMs / vdomTimeMs) * 100;

  // 음수 방지 + 100% 상한
  ratio = Math.max(0, Math.min(100, ratio));

  const ratioStr = ratio >= 100 ? "100% 초과 안됨" : `${ratio.toFixed(0)}% 빠름`;

  refs.resultText.innerHTML =
    `DOM <span class="dom-time">${domTimeMs.toFixed(2)}ms</span> vs ` +
    `VDOM <span class="vdom-time">${vdomTimeMs.toFixed(2)}ms</span>` +
    `<span class="comparison">→ ${faster}이 ${ratioStr}</span>`;
}

/* ────────────────────────────────
   시나리오 전환
   ──────────────────────────────── */

function selectScenario(id) {
  if (isBenchmarkRunning) return;
  const scenario = scenarios.find((s) => s.id === id);
  if (!scenario) return;

  currentScenario = scenario;
  domTimeMs = null;
  vdomTimeMs = null;

  // 버튼 활성 상태 갱신
  overlayEl.querySelectorAll(".bench-scenario-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.scenario === id);
  });

  refs.scenarioDesc.textContent = scenario.description;
  refs.domTimer.textContent = "⏱ 대기 중";
  refs.domTimer.classList.remove("is-done");
  refs.vdomTimer.textContent = "⏱ 대기 중";
  refs.vdomTimer.classList.remove("is-done");
  refs.resultText.textContent = "";

  // 파라미터 UI 렌더링
  renderParamsUI(scenario);

  // 초기 상태 미리보기
  const params = getCurrentParams(scenario);
  const initialVdom = scenario.generateInitial(params);
  renderInitialDOM(refs.domContent, initialVdom);
  renderInitialDOM(refs.vdomContent, initialVdom);
}

/* ────────────────────────────────
   팝업 열기 / 닫기
   ──────────────────────────────── */

function closePopup() {
  if (!overlayEl) return;
  overlayEl.classList.remove("is-open");
  setTimeout(() => {
    overlayEl.remove();
    overlayEl = null;
  }, 300);
}

export function openBenchmarkPopup() {
  if (overlayEl) {
    overlayEl.classList.add("is-open");
    return;
  }

  overlayEl = buildPopupDOM();
  document.body.appendChild(overlayEl);
  cacheRefs(overlayEl);

  // 이벤트 바인딩
  overlayEl.querySelector(".bench-titlebar__close").addEventListener("click", closePopup);
  overlayEl.addEventListener("click", (e) => {
    if (e.target === overlayEl) closePopup();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlayEl) closePopup();
  });

  overlayEl.querySelectorAll(".bench-scenario-btn").forEach((btn) => {
    btn.addEventListener("click", () => selectScenario(btn.dataset.scenario));
  });

  refs.domRunBtn.addEventListener("click", runDOMBenchmark);
  refs.vdomRunBtn.addEventListener("click", runVDOMBenchmark);
  refs.runBothBtn.addEventListener("click", runBothBenchmarks);

  // 첫 시나리오 자동 선택
  selectScenario(scenarios[0].id);

  // 애니메이션을 위해 한 프레임 뒤에 열기
  requestAnimationFrame(() => overlayEl.classList.add("is-open"));
}
