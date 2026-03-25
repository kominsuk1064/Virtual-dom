/**
 * vdomToDom + WeakMap 빌드
 *
 * 기존 vdomToDom과 동일한 DOM을 생성하되,
 * vdomNode → domNode 매핑을 WeakMap에 기록한다.
 * patch-mapped.js가 이 Map으로 O(1) 노드 조회를 수행한다.
 *
 * 제거 방법: 이 파일과 src/optimized/ 폴더를 삭제하면 된다.
 */

export function vdomToDomMapped(vnode, nodeMap) {
  if (!vnode) return document.createTextNode("");

  if (vnode.type === "#text") {
    const text = document.createTextNode(vnode.text ?? "");
    nodeMap.set(vnode, text);
    return text;
  }

  const el = document.createElement(vnode.type);
  for (const [name, value] of Object.entries(vnode.props ?? {})) {
    if (name === "key") continue;
    el.setAttribute(name, String(value));
  }

  for (const child of vnode.children ?? []) {
    el.appendChild(vdomToDomMapped(child, nodeMap));
  }

  nodeMap.set(vnode, el);
  return el;
}
