/**
 * Key 기반 diff + _ref 직접 참조
 *
 * 기존 diff.js 대비 두 가지 개선:
 * 1. 자식 비교 시 props.key로 매칭 (없으면 인덱스 폴백)
 * 2. 각 패치에 _ref(대상 oldVdom) / _parentRef(부모 oldVdom) 첨부
 *    → patch-mapped.js가 WeakMap으로 O(1) DOM 조회 가능
 *
 * 패치 포맷은 기존과 호환된다 (_ref/_parentRef는 추가 필드).
 *
 * 제거 방법: 이 파일과 src/optimized/ 폴더를 삭제하면 된다.
 */

function diffProps(oldProps = {}, newProps = {}) {
  const setProps = {};
  const removeProps = [];

  for (const [name, value] of Object.entries(newProps)) {
    if (name === "key") continue;
    if (oldProps[name] !== value) setProps[name] = value;
  }

  for (const name of Object.keys(oldProps)) {
    if (name === "key") continue;
    if (!(name in newProps)) removeProps.push(name);
  }

  return { setProps, removeProps };
}

function getKey(vnode) {
  return vnode?.props?.key ?? vnode?.props?.["data-key"] ?? null;
}

/* ── Key 기반 자식 매칭 ─────────────────────────── */

/**
 * LIS(Longest Increasing Subsequence) — 이동하지 않아도 되는 노드를 찾는다.
 * 반환값: LIS에 포함된 인덱스의 Set
 */
function lisIndices(arr) {
  if (arr.length === 0) return new Set();

  const tails = [];      // tails[i] = 길이 i+1인 IS의 마지막 값
  const tailIdx = [];    // tails에 대응하는 arr 인덱스
  const prev = new Array(arr.length).fill(-1);

  for (let i = 0; i < arr.length; i++) {
    const val = arr[i];
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (tails[mid] < val) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = val;
    tailIdx[lo] = i;
    prev[i] = lo > 0 ? tailIdx[lo - 1] : -1;
  }

  const result = new Set();
  let k = tailIdx[tails.length - 1];
  for (let i = tails.length; i > 0; i--) {
    result.add(k);
    k = prev[k];
  }
  return result;
}

function diffChildrenKeyed(oldChildren, newChildren, path, parentOldVdom) {
  const patches = [];

  const oldByKey = new Map();
  const oldUnkeyed = [];

  for (let i = 0; i < oldChildren.length; i++) {
    const key = getKey(oldChildren[i]);
    if (key != null) {
      oldByKey.set(key, { index: i, node: oldChildren[i] });
    } else {
      oldUnkeyed.push({ index: i, node: oldChildren[i] });
    }
  }

  const consumed = new Set();
  let unkeyedCursor = 0;

  // 매칭 결과: { matched: oldEntry | null, newChild, newIdx }
  const matchResult = [];

  for (let newIdx = 0; newIdx < newChildren.length; newIdx++) {
    const newChild = newChildren[newIdx];
    const newKey = getKey(newChild);
    let matched = null;

    if (newKey != null && oldByKey.has(newKey)) {
      matched = oldByKey.get(newKey);
      consumed.add(matched.index);
      oldByKey.delete(newKey);
    } else if (newKey == null) {
      while (unkeyedCursor < oldUnkeyed.length && consumed.has(oldUnkeyed[unkeyedCursor].index)) {
        unkeyedCursor++;
      }
      if (unkeyedCursor < oldUnkeyed.length) {
        matched = oldUnkeyed[unkeyedCursor];
        consumed.add(matched.index);
        unkeyedCursor++;
      }
    }

    matchResult.push({ matched, newChild, newIdx });
  }

  // 매칭되지 않은 old 자식 제거 (역순으로 안전하게)
  const toRemove = [];
  for (let i = 0; i < oldChildren.length; i++) {
    if (!consumed.has(i)) toRemove.push(i);
  }
  for (let i = toRemove.length - 1; i >= 0; i--) {
    patches.push({
      type: "REMOVE",
      path: [...path, toRemove[i]],
      _ref: oldChildren[toRemove[i]],
    });
  }

  // 매칭된 노드에 대해 재귀 diff + MOVE 판정
  // LIS로 이동하지 않아도 되는 노드를 결정
  const oldIndicesOfMatched = [];
  const matchedEntries = [];
  for (const entry of matchResult) {
    if (entry.matched) {
      oldIndicesOfMatched.push(entry.matched.index);
      matchedEntries.push(entry);
    }
  }

  const stableSet = lisIndices(oldIndicesOfMatched);

  let matchedCursor = 0;
  for (const entry of matchResult) {
    if (entry.matched) {
      // 재귀 diff (내부 변경 검출)
      patches.push(...diff(entry.matched.node, entry.newChild, [...path, entry.newIdx]));

      // LIS에 없으면 MOVE 필요
      if (!stableSet.has(matchedCursor)) {
        patches.push({
          type: "MOVE",
          path,
          from: entry.matched.index,
          to: entry.newIdx,
          _ref: entry.matched.node,
          _parentRef: parentOldVdom,
        });
      }
      matchedCursor++;
    } else {
      // 새 노드 추가
      patches.push({
        type: "ADD",
        path,
        node: entry.newChild,
        index: entry.newIdx,
        _parentRef: parentOldVdom,
      });
    }
  }

  return patches;
}

/* ── 인덱스 기반 폴백 (key 없을 때) ──────────────── */

function diffChildrenIndexed(oldChildren, newChildren, path, parentOldVdom) {
  const patches = [];
  const sharedLen = Math.min(oldChildren.length, newChildren.length);

  for (let i = 0; i < sharedLen; i++) {
    patches.push(...diff(oldChildren[i], newChildren[i], [...path, i]));
  }

  for (let i = oldChildren.length - 1; i >= sharedLen; i--) {
    patches.push({ type: "REMOVE", path: [...path, i], _ref: oldChildren[i] });
  }

  for (let i = sharedLen; i < newChildren.length; i++) {
    patches.push({
      type: "ADD",
      path,
      node: newChildren[i],
      index: i,
      _parentRef: parentOldVdom,
    });
  }

  return patches;
}

/* ── 메인 diff ────────────────────────────────────── */

export function diff(oldVDOM, newVDOM, path = []) {
  if (!oldVDOM && !newVDOM) return [];

  if (!oldVDOM && newVDOM) {
    if (path.length === 0) return [{ type: "REPLACE", path, node: newVDOM }];
    return [{
      type: "ADD",
      path: path.slice(0, -1),
      node: newVDOM,
      index: path[path.length - 1],
    }];
  }

  if (oldVDOM && !newVDOM) {
    if (path.length === 0) return [];
    return [{ type: "REMOVE", path, _ref: oldVDOM }];
  }

  if (oldVDOM.type !== newVDOM.type) {
    return [{ type: "REPLACE", path, node: newVDOM, _ref: oldVDOM }];
  }

  if (oldVDOM.type === "#text") {
    if ((oldVDOM.text ?? "") !== (newVDOM.text ?? "")) {
      return [{ type: "TEXT_UPDATE", path, text: newVDOM.text ?? "", _ref: oldVDOM }];
    }
    return [];
  }

  const patches = [];
  const { setProps, removeProps } = diffProps(oldVDOM.props, newVDOM.props);

  if (Object.keys(setProps).length > 0 || removeProps.length > 0) {
    patches.push({ type: "PROPS_UPDATE", path, setProps, removeProps, _ref: oldVDOM });
  }

  const oldChildren = oldVDOM.children ?? [];
  const newChildren = newVDOM.children ?? [];

  const hasKeys =
    oldChildren.some((c) => getKey(c) != null) ||
    newChildren.some((c) => getKey(c) != null);

  if (hasKeys) {
    patches.push(...diffChildrenKeyed(oldChildren, newChildren, path, oldVDOM));
  } else {
    patches.push(...diffChildrenIndexed(oldChildren, newChildren, path, oldVDOM));
  }

  return patches;
}
