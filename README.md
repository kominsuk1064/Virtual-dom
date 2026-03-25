<!-- MOD: 초심자 발표 흐름에 맞춰 문서 구조와 설명 순서를 재정리 -->
# Beginner-first Virtual DOM Playground

Vanilla JavaScript로 Virtual DOM의 핵심 흐름을 보여주는 발표용 프로토타입입니다. 이 버전은 “개발자가 아닌 사람도 이해할 수 있는 설명 순서”를 목표로 구성되어 있습니다.

## 프로젝트 소개

- 왼쪽은 현재 실제 DOM 화면입니다.
- 오른쪽은 곧 바뀔 후보 화면입니다.
- 사용자는 `textarea` 또는 프리셋 시나리오 버튼으로 다음 화면을 만듭니다.
- 앱은 이전 VDOM과 다음 VDOM을 비교해 patch 목록을 만들고, 실제 DOM에는 바뀐 부분만 반영합니다.
- 반영된 상태는 history에 저장되며 `Undo` / `Redo`로 다시 불러올 수 있습니다.

## 초심자 발표를 위한 화면 구성

이 프로젝트는 발표 중 청중의 시선을 한 번에 한 곳으로 모으기 위해 아래 순서로 설명하도록 설계되어 있습니다.

1. “다음 화면을 먼저 만든다”
2. “컴퓨터가 달라진 부분을 찾는다”
3. “실제 화면에는 꼭 필요한 만큼만 반영한다”

이를 위해 다음 장치를 추가했습니다.

- 용어 번역 카드: Virtual DOM, Diff, Patch, History를 쉬운 말로 먼저 설명
- 프리셋 시나리오 버튼: 제목 변경, 속성 변경, 노드 추가/삭제, 루트 교체를 버튼 한 번으로 시연
- 사람 말 요약 패널: raw patch 대신 “무슨 일이 일어나는지”를 자연어로 먼저 설명
- 변경 위치 하이라이트: 실제 화면과 후보 화면에서 바뀐 위치를 색으로 강조
- 기술 로그 접기: JSON / patch 원본은 필요할 때만 펼쳐서 확인

## 실행 방법

정적 파일 프로젝트이므로 [index.html](./index.html)을 브라우저에서 열면 됩니다. 또는 간단한 정적 서버를 써도 됩니다.

## 동작 흐름

1. 초기 로드 시 실제 영역 컨테이너 안의 첫 번째 루트 element를 읽습니다.
2. `domToVdom`으로 Virtual DOM을 생성합니다.
3. `vdomToDom`으로 실제 영역 DOM을 한 번 다시 렌더링해 canonical DOM으로 정규화합니다.
4. 같은 VDOM을 후보 미리보기 영역에도 렌더링합니다.
5. `textarea`에서 HTML을 수정하거나 프리셋 시나리오를 누르면 파싱 -> VDOM 생성 -> 후보 미리보기 전체 렌더가 수행됩니다.
6. `Patch` 버튼을 누르면 `diff(currentVDOM, newVDOM)` 결과를 `applyPatches`로 실제 영역에 부분 반영합니다.
7. patch가 성공하면 새 VDOM을 history에 push합니다.
8. `Undo` / `Redo`는 저장된 VDOM을 기준으로 실제 영역, 후보 영역, textarea를 함께 다시 동기화합니다.

## 실제 DOM이 느린 이유

실제 DOM 조작은 브라우저 렌더링 파이프라인과 직접 연결됩니다. 따라서 노드를 추가하거나 삭제하고, 레이아웃에 영향을 주는 속성을 바꾸면 아래 비용이 생깁니다.

- Reflow: 레이아웃을 다시 계산하는 비용
- Repaint: 다시 그리는 비용

노드 수가 많거나 변경이 잦을수록 이 비용이 커질 수 있습니다. 그래서 전체 DOM을 매번 다시 그리기보다, 바뀐 부분만 찾아 최소한만 반영하는 전략이 중요합니다.

## Virtual DOM 구조와 필요한 이유

이 프로젝트의 VDOM 스키마는 아래처럼 단순한 객체 구조입니다.

```js
{ type: "#text", text: "hello" }

{
  type: "section",
  props: { class: "catalog-card", "data-state": "initial" },
  children: []
}
```

Virtual DOM이 필요한 이유는 다음과 같습니다.

- 실제 DOM 대신 비교하기 쉬운 JS 객체 구조로 상태를 다룰 수 있습니다.
- 변경 전후 상태를 history로 저장하기 쉽습니다.
- patch를 만들기 전에 어떤 노드가 달라졌는지 명확하게 분석할 수 있습니다.

## 의미 있는 노드 규칙

이 프로젝트는 path 계산과 diff 결과를 안정적으로 맞추기 위해 canonical 규칙을 사용합니다.

- Element 노드는 유지합니다.
- 공백-only Text 노드는 무시합니다.
- Comment 노드는 무시합니다.
- Text 노드를 유지할 때는 trim 결과가 아니라 원본 text를 그대로 저장합니다.
- path 인덱스는 raw `childNodes` 기준이 아니라 의미 있는 자식 노드 순서 기준입니다.

이 규칙을 `domToVdom`, `diff`, `getNodeByPath`, `ADD` 삽입 위치 해석 모두 동일하게 따릅니다.

## Diff 알고리즘의 5가지 핵심 케이스

이 프로젝트의 diff는 child index 기반이며 key / move 최적화는 구현하지 않았습니다.

1. `ADD`
   - 이전에는 없고 새 VDOM에는 있는 자식 노드
2. `REMOVE`
   - 이전에는 있고 새 VDOM에는 없는 자식 노드
3. `REPLACE`
   - 같은 위치의 노드 type이 다를 때
4. `PROPS_UPDATE`
   - 같은 element지만 attribute가 달라졌을 때
5. `TEXT_UPDATE`
   - 같은 text node지만 문자열이 달라졌을 때

추가 규칙:

- 루트 태그가 바뀌면 `REPLACE` at `path []`
- 최상위 루트 삭제는 생성하지 않음
- 같은 부모의 여러 `REMOVE`는 큰 index부터 생성해 path 밀림을 방지

## Patch가 실제 DOM에 반영되는 방식

`applyPatches(rootDom, patches)`는 patch 목록을 순서대로 적용하고, 필요하면 새 루트 DOM을 반환합니다.

- `ADD`: `insertBefore` 또는 `appendChild`
- `REMOVE`: `remove`
- `REPLACE`: `replaceWith`
- `PROPS_UPDATE`: `setAttribute`, `removeAttribute`
- `TEXT_UPDATE`: `textContent`

핵심 포인트는 실제 patch 대상이 컨테이너가 아니라, 정규화된 현재 루트 DOM 노드라는 점입니다.

## Undo / Redo와 State History 구조

상태는 아래 4개 값으로 관리합니다.

- `history`
- `historyIndex`
- `currentVDOM`
- `actualRootNode`

동작 규칙:

- patch 성공 시 새 VDOM을 history 마지막에 push
- undo 후 새 patch가 일어나면 뒤쪽 redo 이력은 제거
- undo / redo는 전체 재렌더를 허용
- undo / redo 이후 `currentVDOM`은 반드시 현재 history state와 다시 동기화

## 브라우저 API 사용

이번 구현에서 사용한 핵심 브라우저 API는 아래와 같습니다.

- `document.querySelector`
- `Node`, `Element`, `Text`
- `template` 요소를 이용한 HTML 파싱
- `childNodes`
- `appendChild`
- `insertBefore`
- `replaceWith`
- `remove`
- `setAttribute`, `removeAttribute`

`MutationObserver`는 적용하지 않았고, 현재 구현은 `Patch` 버튼 기반 수동 반영 방식입니다.

## textarea 기반 입력 방식을 선택한 이유

이번 프로토타입은 `contenteditable` 대신 textarea 기반 HTML 입력을 사용했습니다.

- 텍스트 변경뿐 아니라 속성 변경, 태그 교체, 노드 추가/삭제를 안정적으로 재현하기 쉽습니다.
- 최상위 루트 element 1개 제약을 검증하기 쉽습니다.
- 브라우저가 자동 보정한 편집 DOM을 그대로 비교하는 것보다, 파싱 -> canonical VDOM -> preview 흐름을 설명하기 더 좋습니다.

## 초기 DOM 정규화를 하는 이유

초기 실제 DOM은 브라우저가 해석한 결과이므로 공백-only Text나 Comment가 섞일 수 있습니다. 그래서 init 시 한 번 `domToVdom -> vdomToDom`을 수행해 canonical DOM으로 맞춘 뒤, 그 DOM만 patch 대상으로 사용합니다.

이렇게 해야 path 규칙과 실제 DOM 구조가 일치합니다.

## 테스트 케이스 / 검증 결과

| 케이스 | 입력 예시 | 기대 결과 | 결과 |
| --- | --- | --- | --- |
| 텍스트 변경 | `h3` 문구 수정 | `TEXT_UPDATE` 생성 | 확인 |
| 속성 변경 | `data-theme`, `class` 수정 | `PROPS_UPDATE` 생성 | 확인 |
| 노드 추가 | `li` 하나 추가 | `ADD` 생성 | 확인 |
| 노드 삭제 | 기존 `li` 하나 제거 | `REMOVE` 생성 | 확인 |
| 태그 교체 | 루트 `section` -> `article` | 루트 `REPLACE` 생성 | 확인 |
| Undo / Redo | patch 후 이전/다음 상태 이동 | 실제 영역, 미리보기, textarea 동기화 | 확인 |
| 공백 텍스트 무시 | 줄바꿈/들여쓰기만 추가 | 의미 있는 path 변화 없음 | 확인 |
| 잘못된 입력 차단 | 최상위 element 2개 입력 | Patch 비활성화, 오류 메시지 표시 | 확인 |

## 수동 테스트 시나리오

1. “제목만 바꾸기” 프리셋을 눌러 `TEXT_UPDATE`와 하이라이트를 확인합니다.
2. “속성만 바꾸기” 또는 “목록 1개 추가” 프리셋을 눌러 `PROPS_UPDATE`, `ADD`를 확인합니다.
3. patch 후 `Undo`, `Redo`, `처음 샘플로`를 눌러 history 동기화와 reset 의미를 확인합니다.

## 제한사항

- key 기반 diff / move 최적화는 지원하지 않습니다.
- form 요소의 live property(`value`, `checked`)는 attribute 스냅샷 기준으로만 처리합니다.
- 자동 변경 감지는 하지 않으며 `Patch` 버튼 기반 수동 반영입니다.
- child index 기반 diff이므로 구조 이동보다는 추가 / 삭제 / 교체 중심의 데모에 적합합니다.

## 폴더 구조

```text
Virtual-dom/
├─ index.html
├─ style.css
├─ main.js
├─ CONTRACT.md
├─ prompts/
│  ├─ 공통 프롬프트.txt
│  ├─ agent1.txt
│  ├─ agent2.txt
│  ├─ agent3.txt
│  └─ agent4.txt
└─ src/
   ├─ vdom.js
   ├─ diff.js
   └─ patch.js
```
