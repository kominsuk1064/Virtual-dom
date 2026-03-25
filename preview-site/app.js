import { getNodeByPath } from "../src/patch.js";
import { vdomToDom } from "../src/vdom.js";

const sessionId = new URLSearchParams(window.location.search).get("session") ?? "standalone-preview";
const channel = new BroadcastChannel(`virtual-dom-${sessionId}-preview`);
const mount = document.querySelector("#site-render-root");
let rootNode = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clearNodeHighlights(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const targets = [node, ...node.querySelectorAll("[data-change-kind]")];

  for (const target of targets) {
    target.removeAttribute("data-change-kind");
    target.removeAttribute("data-change-scope");
  }
}

function resolveHighlightElement(node, path, preferParent = false) {
  const target = getNodeByPath(node, path);

  if (target?.nodeType === Node.ELEMENT_NODE) {
    return target;
  }

  if (target?.nodeType === Node.TEXT_NODE) {
    return target.parentElement;
  }

  if (preferParent && path.length > 0) {
    return resolveHighlightElement(node, path.slice(0, -1), false);
  }

  return null;
}

function applyPatchHighlights(node, patches) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  clearNodeHighlights(node);

  for (const patch of patches ?? []) {
    let targetElement = null;
    let highlightKind = "update";

    switch (patch.type) {
      case "ADD":
        targetElement = resolveHighlightElement(node, [...patch.path, patch.index], true);
        highlightKind = "add";
        break;
      case "REMOVE":
        targetElement = resolveHighlightElement(node, patch.path.slice(0, -1), true);
        highlightKind = "remove-context";
        break;
      case "REPLACE":
        targetElement = resolveHighlightElement(node, patch.path, true);
        highlightKind = "replace";
        break;
      case "PROPS_UPDATE":
        targetElement = resolveHighlightElement(node, patch.path, true);
        highlightKind = "update";
        break;
      case "TEXT_UPDATE":
        targetElement = resolveHighlightElement(node, patch.path, true);
        highlightKind = "text";
        break;
      default:
        break;
    }

    if (targetElement) {
      targetElement.dataset.changeKind = highlightKind;
      targetElement.dataset.changeScope = "preview-site";
    }
  }
}

function renderSnapshot(vdom, patches = []) {
  mount.replaceChildren();
  rootNode = null;

  if (!vdom) {
    return;
  }

  rootNode = vdomToDom(vdom);
  mount.appendChild(rootNode);

  if (patches.length > 0) {
    applyPatchHighlights(rootNode, patches);
  }
}

function renderPlaceholder(message) {
  rootNode = null;
  mount.innerHTML = `
    <div class="site-placeholder">
      <div>
        <strong>후보 사이트를 만들 수 없어요</strong>
        <p>${escapeHtml(message)}</p>
      </div>
    </div>
  `;
}

function handleMessage(event) {
  const data = event.data;

  if (!data || data.source !== "virtual-dom-host") {
    return;
  }

  switch (data.type) {
    case "render-snapshot":
      renderSnapshot(data.payload?.vdom ?? null, data.payload?.patches ?? []);
      break;
    case "show-placeholder":
      renderPlaceholder(data.payload?.message ?? "");
      break;
    case "clear-highlights":
      clearNodeHighlights(rootNode);
      break;
    default:
      break;
  }
}

channel.addEventListener("message", handleMessage);
channel.postMessage({
  source: "virtual-dom-site",
  kind: "preview",
  type: "ready"
});
