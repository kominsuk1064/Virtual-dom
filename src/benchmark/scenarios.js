/**
 * 벤치마크 시나리오 정의
 * 각 시나리오는 초기 VDOM과 변경 후 VDOM을 생성하는 함수를 제공한다.
 * params 배열로 사용자 조절 가능한 파라미터를 정의한다.
 */

function makeLi(text, key) {
  const props = key != null ? { key: String(key) } : {};
  return {
    type: "li",
    props,
    children: [{ type: "#text", text }],
  };
}

/**
 * 트리 노드 수 추정 (S4 노드 폭발 방지용)
 */
export function estimateNodeCount(depth, breadth) {
  if (breadth <= 1) return depth + 1;
  return Math.floor((Math.pow(breadth, depth + 1) - 1) / (breadth - 1));
}

export const NODE_LIMIT = 100_000;

// S1: 대량 리스트 부분 수정
function bulkUpdateInitial(count = 1000) {
  const children = [];
  for (let i = 0; i < count; i++) {
    children.push(makeLi(`Item ${i}`, i));
  }
  return { type: "ul", props: { class: "bench-list" }, children };
}

function bulkUpdateModified(count = 1000, changeRatio = 0.1) {
  const children = [];
  const changeEvery = Math.max(1, Math.floor(1 / changeRatio));
  for (let i = 0; i < count; i++) {
    const text = i % changeEvery === 0 ? `Updated-Item ${i} ✓` : `Item ${i}`;
    children.push(makeLi(text, i));
  }
  return { type: "ul", props: { class: "bench-list" }, children };
}

// S2: 리스트 중간 삽입
function middleInsertInitial(count = 500) {
  const children = [];
  for (let i = 0; i < count; i++) {
    children.push(makeLi(`Row ${i}`, `row-${i}`));
  }
  return { type: "ul", props: { class: "bench-list" }, children };
}

function middleInsertModified(count = 500, insertCount = 50) {
  const mid = Math.floor(count / 2);
  const children = [];
  for (let i = 0; i < mid; i++) {
    children.push(makeLi(`Row ${i}`, `row-${i}`));
  }
  for (let j = 0; j < insertCount; j++) {
    children.push(makeLi(`New-${j} ★`, `new-${j}`));
  }
  for (let i = mid; i < count; i++) {
    children.push(makeLi(`Row ${i}`, `row-${i}`));
  }
  return { type: "ul", props: { class: "bench-list" }, children };
}

// S3: 속성 일괄 토글
function propsToggleInitial(count = 300) {
  const children = [];
  for (let i = 0; i < count; i++) {
    children.push({
      type: "div",
      props: { key: String(i), class: "card", "data-active": "false" },
      children: [{ type: "#text", text: `Card ${i}` }],
    });
  }
  return { type: "div", props: { class: "bench-grid" }, children };
}

function propsToggleModified(count = 300) {
  const children = [];
  for (let i = 0; i < count; i++) {
    children.push({
      type: "div",
      props: { key: String(i), class: "card active", "data-active": "true" },
      children: [{ type: "#text", text: `Card ${i}` }],
    });
  }
  return { type: "div", props: { class: "bench-grid" }, children };
}

// S4: 깊은 트리 리프 수정
function buildDeepTree(depth, breadth, leafPrefix) {
  if (depth === 0) {
    return { type: "#text", text: `${leafPrefix}` };
  }

  const children = [];
  for (let i = 0; i < breadth; i++) {
    children.push({
      type: "div",
      props: { key: String(i), class: `depth-${depth}` },
      children: [buildDeepTree(depth - 1, breadth, `${leafPrefix}-${i}`)],
    });
  }
  return { type: "div", props: { class: `tree-level-${depth}` }, children };
}

function deepTreeInitial(depth = 5, breadth = 4) {
  return buildDeepTree(depth, breadth, "Leaf");
}

function deepTreeModified(depth = 5, breadth = 4) {
  return buildDeepTree(depth, breadth, "Changed");
}

// S5: 부분 삭제 (중간 영역 제거)
function partialDeleteInitial(count = 1000) {
  const children = [];
  for (let i = 0; i < count; i++) {
    children.push(makeLi(`Row ${i}`, `row-${i}`));
  }
  return { type: "ul", props: { class: "bench-list" }, children };
}

function partialDeleteModified(count = 1000, deleteRatio = 0.2) {
  const deleteCount = Math.floor(count * deleteRatio);
  const start = Math.floor((count - deleteCount) / 2);
  const children = [];
  for (let i = 0; i < count; i++) {
    if (i >= start && i < start + deleteCount) continue;
    children.push(makeLi(`Row ${i}`, `row-${i}`));
  }
  return { type: "ul", props: { class: "bench-list" }, children };
}

export const scenarios = [
  {
    id: "bulk-update",
    name: "대량 수정",
    icon: "📝",
    description: "리스트 중 일부만 텍스트 변경",
    params: [
      { key: "count", label: "항목 수", default: 3000, min: 10, max: 100000, step: 100 },
      { key: "changeRatio", label: "변경 비율(%)", default: 5, min: 1, max: 100, step: 1 },
    ],
    estimateNodes: ({ count }) => count + 1,
    generateInitial: ({ count }) => bulkUpdateInitial(count),
    generateModified: ({ count, changeRatio }) => bulkUpdateModified(count, changeRatio / 100),
  },
  {
    id: "middle-insert",
    name: "중간 삽입",
    icon: "➕",
    description: "리스트 중간에 항목 삽입",
    params: [
      { key: "count", label: "전체 항목 수", default: 1000, min: 10, max: 100000, step: 100 },
      { key: "insertCount", label: "삽입 항목 수", default: 100, min: 10, max: 10000, step: 10 },
    ],
    estimateNodes: ({ count, insertCount }) => count + insertCount + 1,
    generateInitial: ({ count }) => middleInsertInitial(count),
    generateModified: ({ count, insertCount }) =>
      middleInsertModified(count, Math.min(insertCount, count)),
  },
  {
    id: "partial-delete",
    name: "부분 삭제",
    icon: "🗑️",
    description: "리스트 중간 영역을 일괄 삭제",
    params: [
      { key: "count", label: "전체 항목 수", default: 1000, min: 10, max: 100000, step: 100 },
      { key: "deleteRatio", label: "삭제 비율(%)", default: 20, min: 1, max: 90, step: 1 },
    ],
    estimateNodes: ({ count }) => count + 1,
    generateInitial: ({ count }) => partialDeleteInitial(count),
    generateModified: ({ count, deleteRatio }) => partialDeleteModified(count, deleteRatio / 100),
  },
  {
    id: "props-toggle",
    name: "속성 토글",
    icon: "🔄",
    description: "모든 요소의 class/data 속성 일괄 변경",
    params: [
      { key: "count", label: "요소 수", default: 1000, min: 10, max: 100000, step: 100 },
    ],
    estimateNodes: ({ count }) => count + 1,
    generateInitial: ({ count }) => propsToggleInitial(count),
    generateModified: ({ count }) => propsToggleModified(count),
  },
  {
    id: "deep-tree",
    name: "트리 리프",
    icon: "🌳",
    description: "깊은 트리의 최하위 리프 텍스트만 변경",
    params: [
      { key: "depth", label: "깊이", default: 6, min: 2, max: 10, step: 1 },
      { key: "breadth", label: "분기 수", default: 4, min: 2, max: 6, step: 1 },
    ],
    estimateNodes: ({ depth, breadth }) => estimateNodeCount(depth, breadth),
    generateInitial: ({ depth, breadth }) => deepTreeInitial(depth, breadth),
    generateModified: ({ depth, breadth }) => deepTreeModified(depth, breadth),
  },
];
