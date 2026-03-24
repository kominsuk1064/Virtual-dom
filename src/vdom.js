/**
 * Convert a DOM node into a VDOM node.
 * Team member A will replace this starter implementation.
 */
export function domToVdom(node) {
  if (!node) {
    return null;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return { type: "#text", text: node.textContent ?? "" };
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  return {
    type: node.tagName.toLowerCase(),
    props: {},
    children: []
  };
}

/**
 * Convert a VDOM node into a real DOM node.
 * Team member A will replace this starter implementation.
 */
export function vdomToDom(vnode) {
  if (!vnode) {
    return document.createTextNode("");
  }

  if (vnode.type === "#text") {
    return document.createTextNode(vnode.text ?? "");
  }

  return document.createElement(vnode.type);
}

/**
 * Clone a VDOM object deeply.
 */
export function cloneVdom(vdom) {
  return vdom == null ? null : JSON.parse(JSON.stringify(vdom));
}

