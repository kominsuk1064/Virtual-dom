/**
 * vdomToDom + WeakMap 빌드
 *
 * 기존 vdomToDom과 동일한 DOM을 생성하되,
 * vdomNode → domNode 매핑을 WeakMap에 기록한다.
 * patch-mapped.js가 이 Map으로 O(1) 노드 조회를 수행한다.
 *
 * 제거 방법: 이 파일과 src/optimized/ 폴더를 삭제하면 된다.
 */

/**
 * VDOM → DOM 변환 + WeakMap 매핑 구축.
 * 기존 vdomToDom과 동일한 DOM을 생성하되, nodeMap에 vnode→dom 매핑을 기록한다.
 * key 속성은 DOM 속성으로 렌더링하지 않는다 (diff 전용).
 *
 * @param {Object} vnode - VDOM 노드 ({type, props, children} 또는 {type:"#text", text})
 * @param {WeakMap} nodeMap - 빈 WeakMap 또는 기존 매핑 (결과가 추가됨)
 * @returns {Node} 생성된 DOM 노드
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
