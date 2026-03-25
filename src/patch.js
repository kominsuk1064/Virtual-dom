import { vdomToDom } from "./vdom.js";

/**
 * Check whether a DOM node participates in the canonical tree.
 */
function isMeaningfulNode(node) {
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
 * Return canonical child nodes used by patch path calculations.
 */
function getMeaningfulChildNodes(node) {
  return Array.from(node?.childNodes ?? []).filter(isMeaningfulNode);
}

/**
 * Warn about invalid patch paths without breaking the app.
 */
function warnInvalidPath(path, patchType) {
  console.warn(`[patch:${patchType}] Ignored invalid path: ${JSON.stringify(path)}`);
}

/**
 * Apply attribute updates to an element node.
 */
function applyPropsUpdate(node, setProps = {}, removeProps = []) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  for (const name of removeProps) {
    node.removeAttribute(name);
  }

  for (const [name, value] of Object.entries(setProps)) {
    node.setAttribute(name, String(value));
  }
}

/**
 * Find a node by canonical child path.
 */
export function getNodeByPath(root, path) {
  let current = root;

  for (const index of path) {
    const children = getMeaningfulChildNodes(current);
    current = children[index] ?? null;

    if (!current) {
      return null;
    }
  }

  return current;
}

/**
 * Apply a single patch and return the current root.
 */
function applyPatch(currentRoot, patch) {
  switch (patch.type) {
    case "ADD": {
      const parent = getNodeByPath(currentRoot, patch.path);

      if (!parent) {
        warnInvalidPath(patch.path, patch.type);
        return currentRoot;
      }

      const nextNode = vdomToDom(patch.node);
      const targetChildren = getMeaningfulChildNodes(parent);
      const referenceNode = targetChildren[patch.index] ?? null;

      if (referenceNode) {
        parent.insertBefore(nextNode, referenceNode);
      } else {
        parent.appendChild(nextNode);
      }

      return currentRoot;
    }

    case "REMOVE": {
      if (patch.path.length === 0) {
        console.warn("[patch:REMOVE] Root removal is ignored in this project.");
        return currentRoot;
      }

      const target = getNodeByPath(currentRoot, patch.path);

      if (!target) {
        warnInvalidPath(patch.path, patch.type);
        return currentRoot;
      }

      target.remove();
      return currentRoot;
    }

    case "REPLACE": {
      const replacement = vdomToDom(patch.node);

      if (patch.path.length === 0) {
        if (currentRoot?.parentNode) {
          currentRoot.replaceWith(replacement);
        }

        return replacement;
      }

      const target = getNodeByPath(currentRoot, patch.path);

      if (!target) {
        warnInvalidPath(patch.path, patch.type);
        return currentRoot;
      }

      target.replaceWith(replacement);
      return currentRoot;
    }

    case "PROPS_UPDATE": {
      const target = getNodeByPath(currentRoot, patch.path);

      if (!target) {
        warnInvalidPath(patch.path, patch.type);
        return currentRoot;
      }

      applyPropsUpdate(target, patch.setProps, patch.removeProps);
      return currentRoot;
    }

    case "TEXT_UPDATE": {
      const target = getNodeByPath(currentRoot, patch.path);

      if (!target) {
        warnInvalidPath(patch.path, patch.type);
        return currentRoot;
      }

      target.textContent = patch.text ?? "";
      return currentRoot;
    }

    default:
      return currentRoot;
  }
}

/**
 * Apply a patch list to a root DOM node.
 */
export function applyPatches(rootDom, patches) {
  let currentRoot = rootDom;

  for (const patch of patches ?? []) {
    currentRoot = applyPatch(currentRoot, patch);
  }

  return currentRoot;
}
