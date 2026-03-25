/**
 * WeakMap 기반 O(1) 패치 적용
 *
 * diff-keyed.js가 각 패치에 첨부한 _ref / _parentRef를 사용하여
 * WeakMap<vdomNode, domNode>에서 대상 DOM 노드를 O(1)로 조회한다.
 * 기존 getNodeByPath의 O(n) 탐색(매번 배열 생성)을 완전히 제거.
 *
 * 제거 방법: 이 파일과 src/optimized/ 폴더를 삭제하면 된다.
 */

import { vdomToDomMapped } from "./vdom-mapped.js";

/**
 * WeakMap O(1) 패치 적용.
 * _ref/_parentRef로 대상 DOM을 조회하여 ADD/REMOVE/REPLACE/MOVE/PROPS_UPDATE/TEXT_UPDATE를 수행한다.
 * nodeMap 조회 실패 시 해당 패치를 건너뛴다 (graceful skip).
 * @param {Node} rootDom - 현재 렌더링된 루트 DOM 노드
 * @param {Array} patches - diff가 생성한 패치 배열
 * @param {WeakMap} nodeMap - vdomNode → domNode 매핑 (vdomToDomMapped가 구축)
 * @returns {Node} 패치 적용 후 루트 DOM (REPLACE 시 교체될 수 있음)
 */
export function applyPatchesMapped(rootDom, patches, nodeMap) {
  let currentRoot = rootDom;

  for (const patch of patches ?? []) {
    switch (patch.type) {
      case "ADD": {
        const parent = patch._parentRef ? nodeMap.get(patch._parentRef) : null;
        if (!parent) break;

        const newNode = vdomToDomMapped(patch.node, nodeMap);
        const ref = parent.childNodes[patch.index] ?? null;
        ref ? parent.insertBefore(newNode, ref) : parent.appendChild(newNode);
        break;
      }

      case "REMOVE": {
        if (patch.path.length === 0) break;
        const target = patch._ref ? nodeMap.get(patch._ref) : null;
        if (target) target.remove();
        break;
      }

      case "REPLACE": {
        const target = patch._ref ? nodeMap.get(patch._ref) : null;
        if (!target) break;

        const replacement = vdomToDomMapped(patch.node, nodeMap);
        if (patch.path.length === 0) {
          if (currentRoot.parentNode) currentRoot.replaceWith(replacement);
          currentRoot = replacement;
        } else {
          target.replaceWith(replacement);
        }
        break;
      }

      case "MOVE": {
        const parent = patch._parentRef ? nodeMap.get(patch._parentRef) : null;
        const child = patch._ref ? nodeMap.get(patch._ref) : null;
        if (!parent || !child) break;

        const ref = parent.childNodes[patch.to] ?? null;
        parent.insertBefore(child, ref);
        break;
      }

      case "PROPS_UPDATE": {
        const target = patch._ref ? nodeMap.get(patch._ref) : null;
        if (!target || target.nodeType !== Node.ELEMENT_NODE) break;

        for (const name of patch.removeProps ?? []) target.removeAttribute(name);
        for (const [name, value] of Object.entries(patch.setProps ?? {})) {
          target.setAttribute(name, String(value));
        }
        break;
      }

      case "TEXT_UPDATE": {
        const target = patch._ref ? nodeMap.get(patch._ref) : null;
        if (!target) break;
        target.textContent = patch.text ?? "";
        break;
      }
    }
  }

  return currentRoot;
}
