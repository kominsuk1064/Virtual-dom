/**
 * Find a node by childNodes path.
 * Team member C will replace this starter implementation.
 */
export function getNodeByPath(root, path) {
  let current = root;

  for (const index of path) {
    if (!current || !current.childNodes || !current.childNodes[index]) {
      return null;
    }

    current = current.childNodes[index];
  }

  return current;
}

/**
 * Apply a patch list to a root DOM node.
 * Team member C will replace this starter implementation.
 */
export function applyPatches(rootDom, patches) {
  void rootDom;
  void patches;
}

