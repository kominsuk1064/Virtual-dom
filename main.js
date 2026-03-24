const sampleMarkup = `
  <section class="sample-card" data-state="initial">
    <h3>오늘의 추천 상품</h3>
    <p>Patch 버튼을 누르기 전까지는 실제 영역이 그대로 유지됩니다.</p>
    <ul>
      <li>사과</li>
      <li>바나나</li>
      <li>오렌지</li>
    </ul>
  </section>
`;

const realRoot = document.querySelector("#real-root");
const testRoot = document.querySelector("#test-root");
const patchButton = document.querySelector("#patch-button");
const undoButton = document.querySelector("#undo-button");
const redoButton = document.querySelector("#redo-button");
const resetButton = document.querySelector("#reset-button");
const patchLog = document.querySelector("#patch-log");
const vdomPreview = document.querySelector("#vdom-preview");
const stateIndicator = document.querySelector("#state-indicator");

/**
 * Render the initial sample markup into both panels.
 */
function renderInitialSample() {
  realRoot.innerHTML = sampleMarkup;
  testRoot.innerHTML = sampleMarkup;

  patchLog.textContent = [
    "[info] Starter scaffold is ready.",
    "[todo] Implement domToVdom / diff / applyPatches / history flow."
  ].join("\n");

  vdomPreview.textContent = JSON.stringify(
    {
      type: "section",
      props: { class: "sample-card", "data-state": "initial" },
      children: [
        { type: "h3", props: {}, children: [{ type: "#text", text: "오늘의 추천 상품" }] },
        {
          type: "p",
          props: {},
          children: [
            {
              type: "#text",
              text: "Patch 버튼을 누르기 전까지는 실제 영역이 그대로 유지됩니다."
            }
          ]
        }
      ]
    },
    null,
    2
  );

  stateIndicator.textContent = "Starter Ready";
}

/**
 * Reflect button state in the UI shell.
 */
function syncButtonState() {
  undoButton.disabled = true;
  redoButton.disabled = true;
}

/**
 * Handle the temporary reset behavior before the full logic is implemented.
 */
function resetScaffold() {
  renderInitialSample();
  syncButtonState();
}

patchButton.addEventListener("click", () => {
  patchLog.textContent = [
    "[info] Patch workflow placeholder",
    "[next] Team D will connect currentVDOM, diff(), applyPatches(), history."
  ].join("\n");
});

resetButton.addEventListener("click", resetScaffold);
undoButton.addEventListener("click", () => {});
redoButton.addEventListener("click", () => {});

renderInitialSample();
syncButtonState();

