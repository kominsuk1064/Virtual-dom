/**
 * 벤치마크 시나리오 정의
 * 각 시나리오는 초기 VDOM과 변경 후 VDOM을 생성하는 함수를 제공한다.
 */

function makeLi(text, key) {
  const props = key != null ? { key: String(key) } : {};
  return {
    type: "li",
    props,
    children: [{ type: "#text", text }],
  };
}

function makeDiv(className, text) {
  return {
    type: "div",
    props: { class: className },
    children: [{ type: "#text", text }],
  };
}

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
  const changeEvery = Math.floor(1 / changeRatio);
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

export const scenarios = [
  {
    id: "bulk-update",
    name: "대량 수정",
    icon: "📝",
    description: "3000개 리스트 중 5%만 텍스트 변경",
    generateInitial: () => bulkUpdateInitial(3000),
    generateModified: () => bulkUpdateModified(3000, 0.05),
  },
  {
    id: "middle-insert",
    name: "중간 삽입",
    icon: "➕",
    description: "1000개 리스트 끝에 100개 항목 삽입",
    generateInitial: () => middleInsertInitial(1000),
    generateModified: () => middleInsertModified(1000, 100),
  },
  {
    id: "props-toggle",
    name: "속성 토글",
    icon: "🔄",
    description: "1000개 요소의 class/data 속성 일괄 변경",
    generateInitial: () => propsToggleInitial(1000),
    generateModified: () => propsToggleModified(1000),
  },
  {
    id: "deep-tree",
    name: "트리 리프",
    icon: "🌳",
    description: "6단계 깊이 트리의 최하위 리프 텍스트만 변경",
    generateInitial: () => deepTreeInitial(6, 4),
    generateModified: () => deepTreeModified(6, 4),
  },
];
