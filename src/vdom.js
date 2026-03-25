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
 * Return canonical child nodes used by VDOM path calculations.
 */
function getMeaningfulChildNodes(node) {
  return Array.from(node?.childNodes ?? []).filter(isMeaningfulNode);
}

/**
 * Convert a DOM node into a VDOM node.
 */
export function domToVdom(node) {
  if (!isMeaningfulNode(node)) {
    return null;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return { type: "#text", text: node.textContent ?? "" };
  }

  const props = {};

  for (const attribute of Array.from(node.attributes ?? [])) {
    props[attribute.name] = attribute.value;
  }

  return {
    type: node.tagName.toLowerCase(),
    props,
    children: getMeaningfulChildNodes(node).map((child) => domToVdom(child)).filter(Boolean)
  };
}

/**
 * Convert a VDOM node into a real DOM node.
 */
export function vdomToDom(vnode) {
  if (!vnode) {
    return document.createTextNode("");
  }

  if (vnode.type === "#text") {
    return document.createTextNode(vnode.text ?? "");
  }

  const element = document.createElement(vnode.type);

  // Form controls use attribute snapshots only in this workshop implementation.
  for (const [name, value] of Object.entries(vnode.props ?? {})) {
    element.setAttribute(name, String(value));
  }

  for (const child of vnode.children ?? []) {
    element.appendChild(vdomToDom(child));
  }

  return element;
}

/**
 * Clone a VDOM object deeply.
 */
export function cloneVdom(vdom) {
  return vdom == null ? null : JSON.parse(JSON.stringify(vdom));
}
