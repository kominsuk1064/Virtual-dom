# Contract

팀 병렬 작업 시 충돌을 줄이기 위한 공통 계약 문서입니다.

## File Ownership

- 팀원 A: `src/vdom.js`
- 팀원 B: `src/diff.js`
- 팀원 C: `src/patch.js`
- 팀원 D: `main.js`, `index.html`, `style.css`, `README.md`

## VDOM Schema

```js
// Text node
{ type: "#text", text: "hello" }

// Element node
{
  type: "div",
  props: { class: "card" },
  children: []
}
```

## Patch Format

```js
{ type: "ADD", path: [], node, index: 0 }
{ type: "REMOVE", path: [1, 0] }
{ type: "REPLACE", path: [0], node }
{ type: "PROPS_UPDATE", path: [0], setProps: {}, removeProps: [] }
{ type: "TEXT_UPDATE", path: [0, 0], text: "updated" }
```

## Patch Path Rules

- `ADD.path` 는 부모 노드 경로입니다.
- `ADD.index` 는 부모 아래 삽입 위치입니다.
- `REMOVE`, `REPLACE`, `PROPS_UPDATE`, `TEXT_UPDATE` 의 `path` 는 대상 노드 경로입니다.

## Shared Functions

아래 함수명은 변경하지 않습니다.

- `domToVdom(node)`
- `vdomToDom(vnode)`
- `cloneVdom(vdom)`
- `diff(oldVDOM, newVDOM, path = [])`
- `getNodeByPath(root, path)`
- `applyPatches(rootDom, patches)`
- `syncBothAreasFromVdom(vdom)`

## Common Rules

- 공백-only 텍스트 노드는 생성과 비교 모두 무시합니다.
- diff 는 child index 기반으로만 구현합니다.
- key / move 최적화는 이번 범위에서 제외합니다.
- Patch 버튼은 부분 업데이트를 보여줘야 합니다.
- undo / redo 는 전체 재렌더를 허용합니다.
- undo / redo 후 `currentVDOM` 을 반드시 history 기준으로 갱신합니다.

