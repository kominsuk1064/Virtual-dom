/**
 * Compare two prop maps and collect mutations.
 */
function diffProps(oldProps = {}, newProps = {}) {
  const setProps = {};
  const removeProps = [];

  for (const [name, value] of Object.entries(newProps)) {
    if (oldProps[name] !== value) {
      setProps[name] = value;
    }
  }

  for (const name of Object.keys(oldProps)) {
    if (!(name in newProps)) {
      removeProps.push(name);
    }
  }

  return { setProps, removeProps };
}

/**
 * Compare two VDOM trees and return a patch list.
 */
export function diff(oldVDOM, newVDOM, path = []) {
  if (!oldVDOM && !newVDOM) {
    return [];
  }

  if (!oldVDOM && newVDOM) {
    if (path.length === 0) {
      return [{ type: "REPLACE", path, node: newVDOM }];
    }

    return [
      {
        type: "ADD",
        path: path.slice(0, -1),
        node: newVDOM,
        index: path[path.length - 1]
      }
    ];
  }

  if (oldVDOM && !newVDOM) {
    if (path.length === 0) {
      return [];
    }

    return [{ type: "REMOVE", path }];
  }

  if (oldVDOM.type !== newVDOM.type) {
    return [{ type: "REPLACE", path, node: newVDOM }];
  }

  if (oldVDOM.type === "#text") {
    if ((oldVDOM.text ?? "") !== (newVDOM.text ?? "")) {
      return [{ type: "TEXT_UPDATE", path, text: newVDOM.text ?? "" }];
    }

    return [];
  }

  const patches = [];
  const { setProps, removeProps } = diffProps(oldVDOM.props, newVDOM.props);

  if (Object.keys(setProps).length > 0 || removeProps.length > 0) {
    patches.push({
      type: "PROPS_UPDATE",
      path,
      setProps,
      removeProps
    });
  }

  const oldChildren = oldVDOM.children ?? [];
  const newChildren = newVDOM.children ?? [];
  const sharedLength = Math.min(oldChildren.length, newChildren.length);

  for (let index = 0; index < sharedLength; index += 1) {
    patches.push(...diff(oldChildren[index], newChildren[index], [...path, index]));
  }

  for (let index = oldChildren.length - 1; index >= sharedLength; index -= 1) {
    patches.push({ type: "REMOVE", path: [...path, index] });
  }

  for (let index = sharedLength; index < newChildren.length; index += 1) {
    patches.push({
      type: "ADD",
      path,
      node: newChildren[index],
      index
    });
  }

  return patches;
}
