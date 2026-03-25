# VDOM 최적화 엔진 학습 가이드

## 이 문서의 목적

이 문서는 아래 자료를 "구현 지시문"이 아니라 "이해용 설명서"로 다시 풀어쓴 문서다.

- `prompts/공통 프롬프트.txt`
- `prompts/optimized-기능명세서.txt`
- `prompts/optimized-전체적용-프롬프트.txt`
- 현재 코드
  - `src/optimized/`
  - `src/benchmark/`
  - `main.js`
  - `actual-site/app.js`
  - `preview-site/app.js`

핵심 목표는 세 가지다.

1. 이 기능이 왜 필요한지 이해한다.
2. 지금 코드에서 어디까지 구현되어 있는지 이해한다.
3. 나중에 프로젝트 전체에 붙일 때 무엇이 달라지는지 이해한다.


## 한 줄 요약

기존 엔진은 "패치를 적용할 때마다 path를 따라 DOM 트리를 다시 찾는 방식"이고,  
최적화 엔진은 "같은 노드를 key로 연결하고, VDOM 객체와 DOM 노드의 연결표를 WeakMap으로 기억해 두는 방식"이다.

즉, 이 기능의 본질은 아래 두 가지다.

- diff를 더 똑똑하게 만들기: index 비교 -> key 비교
- patch를 더 빠르게 만들기: path 탐색 -> WeakMap 직접 조회


## 먼저 알아야 할 배경

현재 프로젝트의 기본 구조는 교육용 Virtual DOM 놀이터다.

사용자가 HTML을 수정하면:

1. HTML을 파싱해서 VDOM을 만든다.
2. 이전 VDOM과 다음 VDOM을 비교해서 patch 목록을 만든다.
3. patch를 실제 DOM에 반영한다.
4. history에 저장해서 undo/redo를 가능하게 한다.

이 흐름 자체는 아주 좋다.  
다만 노드가 많아질수록 기본 방식의 비용이 커진다.


## 기존 엔진이 느려지는 이유

### 1. diff가 index 기준이다

기본 `src/diff.js`는 자식을 index 순서대로 비교한다.

이 방식은 다음 상황에서 비효율이 생긴다.

- 리스트 중간에 새 항목 1개 삽입
- 리스트 순서 변경
- 앞쪽 항목이 하나 밀리면서 뒤쪽이 전부 어긋나는 경우

예를 들어:

```text
old: [A, B, C, D]
new: [A, X, B, C, D]
```

index 비교는 `B`, `C`, `D`도 다 바뀐 것처럼 보게 만들 수 있다.

즉, "같은 항목인데 위치만 바뀐 것"과 "완전히 다른 항목"을 잘 구분하지 못한다.


### 2. patch가 path를 따라 DOM을 매번 찾는다

기본 `src/patch.js`는 patch 하나를 적용할 때마다:

1. `getNodeByPath(root, path)`를 호출하고
2. 루트부터 자식을 따라 내려가며
3. 의미 있는 자식 배열을 다시 만들고
4. 대상 노드를 찾아서 수정한다.

patch가 많으면 이 탐색이 계속 반복된다.

그래서 기존 구조는 개념 설명에는 좋지만, 대량 노드 벤치마크에는 불리하다.


## 최적화 엔진이 해결하려는 문제

명세서 기준으로 최적화 엔진은 아래를 목표로 한다.

### A. key 기반 diff

자식을 index로만 보지 않고, "같은 항목인지"를 `key`로 판별한다.

### B. WeakMap 기반 patch

한 번 렌더링할 때:

```text
VDOM 노드 객체 -> 실제 DOM 노드
```

이 연결을 WeakMap에 저장한다.

그러면 patch를 적용할 때 path를 따라 DOM을 다시 찾지 않고,  
이미 저장된 연결표에서 바로 꺼낼 수 있다.


## 기본 엔진과 최적화 엔진의 차이

### 기본 엔진

```text
HTML/상태
-> VDOM 생성
-> index 기반 diff
-> path 기반 patch
-> 실제 DOM 반영
```

### 최적화 엔진

```text
HTML/상태
-> VDOM 생성 (가능하면 stable key 포함)
-> key 기반 diff
-> patch에 old VDOM 참조(_ref, _parentRef) 첨부
-> WeakMap으로 DOM 직접 조회
-> 실제 DOM 반영
```

차이를 말로 풀면 이렇다.

- 기본 엔진: "어디 있는지 path로 찾아간다"
- 최적화 엔진: "누구인지 key와 참조로 바로 찾는다"


## key는 무엇이고 왜 필요한가

`key`는 DOM에 보여주기 위한 값이 아니라,  
"이 자식이 이전 렌더의 어떤 자식과 같은 존재인지"를 식별하기 위한 값이다.

예를 들어 상품 목록이라면:

- 좋은 key: 상품 id
- 좋은 key: 주문 번호
- 좋은 key: `row-42`
- 나쁜 key: `Math.random()`
- 나쁜 key: 순서가 자주 바뀌는 리스트에서의 index

중요한 점은 `key`가 "형제끼리" 유일하고,  
렌더 전후에도 같은 항목이면 같은 값을 유지해야 한다는 것이다.


## 현재 benchmark에서 key를 어떻게 만들고 있나

현재 벤치마크는 DOM을 읽어서 key를 추출하지 않는다.  
시나리오 코드가 VDOM 객체를 직접 만들면서 `props.key`를 넣는다.

예시 흐름:

```js
{
  type: "li",
  props: { key: "row-12" },
  children: [{ type: "#text", text: "Row 12" }]
}
```

즉, 현재 benchmark의 key는 "렌더링 도중 자동 생성"이 아니라  
"시나리오 작성 시 직접 지정"하는 방식이다.


## WeakMap은 왜 쓰나

WeakMap은 객체를 key로 쓰는 특수한 Map이다.

이 프로젝트에서 WeakMap을 쓰는 이유는 다음과 같다.

1. key를 객체로 둘 수 있다.
2. VDOM 객체가 사라지면 매핑도 GC(Garbage Collection) 대상이 된다.
3. 오래 살아 있는 대형 Map의 메모리 누수를 줄이기 좋다.

이 프로젝트의 아이디어는 간단하다.

```text
oldVdomNode 객체 -> 실제 DOM 노드
```

를 저장해 두고,

```text
patch._ref -> nodeMap.get(patch._ref)
```

형태로 바로 대상 DOM을 찾는다.


## _ref 와 _parentRef 는 왜 필요한가

최적화 diff는 단순히 patch만 만드는 게 아니라,  
그 patch가 "어떤 old VDOM 노드를 기준으로 만들어졌는지"도 같이 담으려 한다.

예를 들어:

- `REMOVE`, `REPLACE`, `PROPS_UPDATE`, `TEXT_UPDATE`
  - `_ref`: 수정 대상 old VDOM 노드
- `ADD`
  - `_parentRef`: 부모 old VDOM 노드
- `MOVE` (Phase 1에서 추가)
  - `_ref`: 이동할 자식 노드, `_parentRef`: 부모 노드

이 정보가 있으면 patch 단계에서 path를 다시 해석할 필요가 줄어든다.

즉:

```text
path는 설명용 위치 정보
_ref는 실제 조회용 손잡이
```

라고 이해하면 쉽다.


## 구현된 optimized 기능 (전체 프로젝트 적용 완료)

현재 최적화 모듈은 benchmark뿐 아니라 main.js, iframe 모두에 적용되어 있다.

### 1. `src/optimized/index.js`

최적화 모듈의 단일 진입점이다.

- `diffKeyed`
- `vdomToDomMapped`
- `applyPatchesMapped`

를 한 군데서 export한다.


### 2. `src/optimized/vdom-mapped.js`

역할:

- DOM을 생성한다.
- 동시에 `nodeMap.set(vdomNode, domNode)`를 수행한다.

즉, 이 파일은 단순 렌더러가 아니라  
"렌더링 + 매핑 구축기"다.

**사용처**: main.js, actual-site/app.js, preview-site/app.js, benchmark-popup.js


### 3. `src/optimized/diff-keyed.js`

역할:

- key가 있으면 key 기준으로 old/new 자식을 매칭한다.
- key가 없으면 unkeyed 자식은 순차 비교로 폴백한다.
- patch에 `_ref`, `_parentRef`를 붙인다.
- **LIS 알고리즘**으로 최소 MOVE 연산을 계산한다.

이 파일이 하는 핵심 생각은:

> "같은 index에 있는가?" 대신  
> "같은 항목인가?"를 먼저 보자

이다.

**6가지 패치 타입**: ADD, REMOVE, REPLACE, PROPS_UPDATE, TEXT_UPDATE, MOVE

**사용처**: main.js (`const diff = diffKeyed`), benchmark-popup.js


### 4. `src/optimized/patch-mapped.js`

역할:

- patch에 붙은 `_ref`, `_parentRef`를 이용해
- `nodeMap`에서 DOM 노드를 꺼내고
- 최소 DOM 조작을 수행한다.
- **MOVE 패치**: `parent.insertBefore(child, ref)`로 순서 재배치

즉, 기본 patch 엔진의 `getNodeByPath()` 역할을  
WeakMap 조회로 바꾼 것이다.

nodeMap 조회 실패 시 해당 패치를 건너뛴다 (graceful skip).

**사용처**: benchmark-popup.js (main.js에서는 미사용 — diff 결과를 iframe으로 전달하므로)


### 5. `src/benchmark/benchmark-popup.js`

역할:

- benchmark 팝업 UI + 파라미터 입력 시스템
- DOM 방식 측정 (전체 재구축)
- optimized VDOM 방식 측정 (diff + patch)
- 노드 폭발 방지 (NODE_LIMIT 100,000)
- 실행 중 시나리오 전환 방지 (isBenchmarkRunning)

benchmark는 최적화 엔진의 실험장이자 교육 도구다.


## 현재 구현과 명세서 사이의 차이

이 부분이 가장 중요하다.  
공부할 때 "이미 된 것"과 "아직 설계만 된 것"을 구분해야 한다.

| 항목 | 현재 코드 | 상태 |
|------|-----------|------|
| benchmark 팝업 적용 | 되어 있음 | ✅ 완료 |
| main.js 전체 적용 | diffKeyed + vdomToDomMapped + nodeMap 생명주기 | ✅ 완료 (Phase 2) |
| iframe 전체 적용 | 하이브리드 — 초기렌더 Mapped, 증분 기존 방식 | ✅ 완료 (Phase 3) |
| key 소스 | `props.key > props["data-key"] > null` 폴백 | ✅ 완료 |
| MOVE 패치 | LIS 알고리즘 기반 구현 | ✅ 완료 |
| nodeMap 생명주기 | init/undo/redo/reset 4곳 리셋 | ✅ 완료 |
| benchmark 파라미터 | renderParamsUI + NODE_LIMIT + estimateNodes | ✅ 완료 (Phase 4) |
| BroadcastChannel 대응 | 하이브리드 전략 채택 | ✅ 완료 |
| iframe 완전 최적화 (approach A) | newVdom 직접 전송 방식 | ❌ 미착수 (향후 과제) |

이 말은 곧,

> Phase 1~4가 모두 완료되어, 최적화 엔진이 프로젝트 전체에 적용된 상태다.  
> 남은 것은 iframe의 증분 패치까지 완전 최적화하는 approach A뿐이다.

는 뜻이다.


## 왜 benchmark에는 먼저 적용하기 쉬웠나

benchmark는 조건이 단순하다.

1. 시나리오를 코드가 직접 만든다.
2. VDOM에 key를 쉽게 넣을 수 있다.
3. 한 번 렌더하고 한 번 diff/patch 하는 흐름이 분명하다.
4. iframe 통신, history, textarea 검증 같은 주변 요소가 없다.

즉, benchmark는 최적화 엔진의 핵심만 시험하기 좋은 환경이다.

그래서 Phase 4에서 benchmark에 다음 개선을 추가했다:

1. **파라미터 시스템** — 각 시나리오에 `params[]` 배열로 항목 수, 변경 비율 등 조절 가능
2. **노드 폭발 방지** — `estimateNodeCount()`로 사전 계산, `NODE_LIMIT`(100,000) 초과 시 실행 차단
3. **레이스 가드** — `isBenchmarkRunning` 플래그로 동시 실행·시나리오 전환 방지


## 왜 프로젝트 전체 적용은 더 어려웠나

전체 적용은 benchmark보다 고려할 것이 많았다.

### 1. key를 어디서 가져올지 정해야 했다

benchmark는 시나리오 코드가 직접 `props.key`를 넣는다.

하지만 실제 앱은:

- 구조화된 폼 입력으로 VDOM을 만들고
- DOM을 다시 읽어서 VDOM을 만들기도 한다.

그래서 `getKey()` 함수에 폴백 체인을 구현했다:

```js
// diff-keyed.js line 32-33
function getKey(vnode) {
  return vnode?.props?.key ?? vnode?.props?.["data-key"] ?? null;
}
```

`props.key` → `data-key` 속성 → `null` (인덱스 폴백) 순서로 찾는다.


### 2. nodeMap 생명주기를 관리해야 했다

WeakMap은 "객체 identity"에 의존한다.

그런데 이 프로젝트는 `cloneVdom()`을 많이 사용한다 (main.js에 14곳).

`cloneVdom()`은 사실상 새로운 객체를 만든다.  
그러면 예전 WeakMap의 key와 새 VDOM은 서로 다른 객체가 된다.

즉:

```text
old object !== cloned object
```

그래서 undo/redo/reset 이후에는 기존 nodeMap을 계속 쓸 수 없다.

**현재 구현**: main.js에서 4개 리셋 지점을 관리한다:

```js
// init()       — line 1235
// handleUndo() — line 1166
// handleRedo() — line 1187
// handleReset() — line 1203
nodeMap = new WeakMap();
```

단, `syncEditorFieldsFromVdom()`이나 `buildEditableRootFromCurrentState()` 같은  
**임시 DOM 생성** 함수에서는 nodeMap을 리셋하지 않는다.  
cloneVdom이 만든 새 객체는 기존 매핑과 충돌하지 않고, WeakMap이 GC 시 자동 정리하기 때문이다.

> **핵심 설계 원칙**: nodeMap은 "상태 저장소"가 아니라 "렌더 트리에 종속된 캐시"다.  
> 렌더 트리가 바뀌면 캐시를 버리고 다시 만든다.


### 3. iframe은 객체 참조를 그대로 못 넘긴다

이 프로젝트는 `main.js`와 `iframe` 페이지가 메시지로 통신한다.

그런데 `_ref`, `_parentRef`는 "객체 참조"다.  
이 값은 BroadcastChannel이나 postMessage를 거치면 그대로 유지되지 않는다.

즉:

- 같은 메모리 공간 안에서는 `_ref`가 강력한 손잡이
- 메시지 직렬화를 거치면 그 손잡이가 끊긴다

그래서 iframe 통합은 benchmark보다 한 단계 더 어려운 문제였다.

**현재 해결 방식 — 하이브리드 전략:**

```js
// actual-site/app.js, preview-site/app.js
// 초기 렌더: optimized (WeakMap 매핑 구축)
rootNode = vdomToDomMapped(vdom, nodeMap);

// 증분 패치: 기존 방식 (직렬화 가능한 path 기반)
rootNode = applyPatches(rootNode, patches);
```

초기 렌더만 Mapped로 하고, 증분 패치는 기존 `getNodeByPath()` 방식을 유지한다.  
이렇게 하면 BroadcastChannel 직렬화 제약을 피하면서 초기 렌더 성능은 확보한다.


## 명세서가 제안한 전체 적용 방식 (현재 구현 상태 포함)

명세서와 전체 적용 프롬프트는 Phase 단위로 접근했다.

### Phase 1. optimized 내부 보강 ✅ 완료

"벤치마크 실험용" 코드를 "더 믿을 수 있는 엔진"으로 다듬는 것이 목표였다.

구현된 사항:

- `vdomToDomMapped` 경로 일관화 — patch-mapped.js가 ADD/REPLACE에서 Mapped 사용
- `data-key` 폴백 — getKey() 함수
- MOVE 패치 — LIS 알고리즘으로 최소 이동 계산, 6가지 패치 타입 완성
- 전체 함수 JSDoc 문서화


### Phase 2. main.js 통합 ✅ 완료

메인 에디터가 `diffKeyed` + `vdomToDomMapped`를 쓰고,  
`nodeMap` 생명주기를 관리하도록 바뀌었다.

구현된 사항:

- import 교체: `diff → diffKeyed`, `vdomToDom → vdomToDomMapped`
- `let nodeMap = new WeakMap()` 전역 변수
- undo/redo/reset/init 4곳에서 `nodeMap = new WeakMap()` 리셋


### Phase 3. iframe 통합 ✅ 완료 (하이브리드)

actual/preview iframe이 각자 자기 `nodeMap`을 가지게 되었다.

메시지 직렬화 제약 때문에 **하이브리드 전략**을 채택했다:

- 초기 렌더: `vdomToDomMapped` (최적화)
- 증분 패치: 기존 `applyPatches` / `getNodeByPath` (직렬화 호환)

완전 최적화(approach A — iframe이 자체 diff 수행)는 향후 과제로 남겨 두었다.


### Phase 4. benchmark 파라미터 조절 UI ✅ 완료

"여러 조건에서 엔진을 시험해 보는 UI"를 붙이는 단계였다.

구현된 사항:

- `scenarios.js`: 모든 시나리오에 `params[]` 배열, `estimateNodes()` 함수
- `benchmark-popup.js`: 동적 파라미터 입력 UI, 노드 폭발 방지(100K 한도)
- `isBenchmarkRunning` 플래그로 레이스 컨디션 방지


## key 기반 diff를 쉬운 예시로 이해하기

### index 기반 비교

```text
old: [A, B, C]
new: [X, A, B, C]
```

index만 보면:

- old[0] A vs new[0] X -> 다름
- old[1] B vs new[1] A -> 다름
- old[2] C vs new[2] B -> 다름

결과적으로 많은 변화가 생긴 것처럼 보인다.


### key 기반 비교

```text
old: [{key:a}, {key:b}, {key:c}]
new: [{key:x}, {key:a}, {key:b}, {key:c}]
```

key로 보면:

- `a`는 그대로 존재
- `b`는 그대로 존재
- `c`는 그대로 존재
- 새로 생긴 건 `x` 하나

즉, "리스트 전체가 바뀐 것"이 아니라  
"하나가 추가된 것"으로 이해할 수 있다.


## WeakMap patch를 쉬운 예시로 이해하기

기본 patch는 이렇게 생각하면 된다.

```text
"두 번째 자식의 세 번째 자식을 찾아가서 바꿔라"
```

최적화 patch는 이렇게 생각하면 된다.

```text
"전에 봤던 바로 그 노드를 꺼내서 바꿔라"
```

즉,

- path 기반: 위치를 따라가며 찾기
- WeakMap 기반: 신분증으로 바로 찾기


## nodeMap 생명주기 쉽게 이해하기

### 생성

처음 렌더할 때 만든다.

```text
vdomToDomMapped
-> DOM 생성
-> 각 VDOM 노드와 DOM 노드를 WeakMap에 등록
```


### 유지

같은 VDOM 객체 계열을 계속 쓰는 동안은 유효하다.


### 무효화

아래 상황에서는 기존 nodeMap을 믿기 어렵다.

- cloneVdom 이후
- undo/redo로 다른 스냅샷 전환
- reset
- iframe 직렬화 경계 통과


### 재구축

이때는 전체 렌더를 한 번 다시 하면서 nodeMap을 새로 만든다.


## 이 최적화가 프로젝트에서 가지는 의미

이 기능은 단순히 "점수 잘 나오는 benchmark 트릭"이 아니다.

이 프로젝트 안에서의 의미는 다음과 같다.

### 1. 교육용 baseline과 실험용 advanced path를 분리한다

- 기본 엔진은 설명하기 쉽다.
- optimized 엔진은 성능과 실무적 관점을 보여주기 좋다.

둘을 병렬로 유지하면 교육 효과가 좋다.


### 2. "왜 React 같은 라이브러리에서 key가 중요한가"를 몸으로 보여줄 수 있다

이 프로젝트는 key 개념을 추상적으로 설명하는 데서 끝나지 않고,

- key가 없을 때 어떤 일이 생기는지
- key가 있으면 무엇이 줄어드는지
- patch 수와 탐색 비용이 어떻게 달라지는지

를 benchmark로 체감하게 만든다.


### 3. 구조 최적화와 UI 기능 추가를 분리할 수 있다

명세서의 Phase 설계가 좋은 이유는

- 엔진 보강
- 메인 앱 통합
- iframe 통합
- benchmark 편의 기능

을 서로 다른 단계로 나눠 두었기 때문이다.

즉, "최적화 로직"과 "실험 UI"를 섞지 않게 해 준다.


## 이 문서를 읽은 뒤 코드 공부 순서 추천

아래 순서로 보면 이해가 가장 잘 된다.

1. `src/diff.js`
   - 기본 index diff가 어떻게 동작하는지 먼저 본다.

2. `src/patch.js`
   - path 기반 patch가 왜 탐색 비용이 큰지 본다.

3. `src/optimized/vdom-mapped.js`
   - WeakMap이 어디서 만들어지는지 본다.

4. `src/optimized/diff-keyed.js`
   - key 비교와 `_ref` 첨부 방식을 본다.

5. `src/optimized/patch-mapped.js`
   - path 대신 nodeMap을 어떻게 쓰는지 본다.

6. `src/benchmark/benchmark-popup.js`
   - 실제로 benchmark가 optimized 모듈을 어떻게 호출하는지 본다.

7. `prompts/optimized-기능명세서.txt`
   - 현재 코드보다 한 단계 앞선 목표를 정리된 설계 관점에서 읽는다.

8. `prompts/optimized-전체적용-프롬프트.txt`
   - 실제 적용 작업을 어떤 순서로 나누는지 본다.


## 지금 상태를 한 문장으로 정리하면

현재 `src/optimized/`는  
**Phase 1~4 모두 완료되어 프로젝트 전체에 적용된 상태**다.

정리하면:

- **Phase 1** (내부 보강): ✅ — LIS, MOVE, data-key 폴백, JSDoc
- **Phase 2** (main.js): ✅ — diffKeyed + vdomToDomMapped 통합, nodeMap 4곳 리셋
- **Phase 3** (iframe): ✅ — 하이브리드 (Mapped 초기렌더 + 기존 patch 증분)
- **Phase 4** (benchmark): ✅ — 파라미터 UI, 노드 폭발 방지, 레이스 가드

남은 향후 과제:

- iframe 완전 최적화 (approach A — newVdom 직접 전송)
- 벤치마크 DOM측 "타겟 업데이트" 모드 추가 (공정성 개선)


## 마지막 정리

이 기능의 핵심은 어렵게 말하면:

- key 기반 reconciliation
- object reference 기반 DOM lookup
- nodeMap lifecycle management
- serialization boundary 대응

이다.

쉽게 말하면:

> "같은 노드를 더 정확히 알아보고,  
> 그 노드를 더 빨리 찾아가서,  
> 적게 바꾸자"

는 이야기다.

이 한 줄을 기억하면 프롬프트와 명세서 전체가 훨씬 덜 어렵게 읽힌다.


---

## 보충: LIS 알고리즘이 뭔가

LIS(Longest Increasing Subsequence)는 MOVE 패치를 최소화하는 핵심 알고리즘이다.

### 문제 상황

리스트 순서가 바뀌었을 때, 모든 항목을 다 옮기는 건 비효율적이다.  
실제로 옮기지 않아도 되는 항목을 찾아야 한다.

### 예시

old: `[A, B, C, D, E]`  
new: `[B, D, A, C, E]`

key 매칭 후 old 인덱스 배열: `[1, 3, 0, 2, 4]`

LIS를 구하면: `[1, 3, 4]` → B, D, E는 이미 증가 순서이므로 **안 옮겨도 됨**.  
나머지 A, C만 MOVE 패치를 생성한다.

### 시간 복잡도

- 단순 접근: O(n²)
- 우리 구현 (이진 탐색): **O(n log n)**

```js
// diff-keyed.js의 lisIndices() 요약
function lisIndices(arr) {
  // tails[i] = 길이 i+1인 증가 부분수열의 마지막 값
  // 이진 탐색으로 tails에서 삽입 위치를 찾음
  // 역추적으로 실제 LIS 인덱스를 복원
}
```


---

## 보충: 벤치마크 공정성 분석

### "항목 100개 + 변경 100%에서도 VDOM이 항상 이기는데, 이게 맞나?"

**결론: 현재 벤치마크 설계상 맞다. 하지만 불완전한 비교다.**

### DOM 측이 하는 일

```js
container.replaceChildren();           // 기존 100개 노드 제거
const newDom = vdomToDom(modifiedVdom); // 100개 새 노드 생성 (createElement + setAttribute)
container.appendChild(newDom);          // DOM 트리에 삽입
```

### VDOM 측이 하는 일

```js
const patches = diffKeyed(oldVdom, newVdom); // 100개 TEXT_UPDATE 패치
applyPatchesMapped(rootNode, patches, nodeMap); // 100개 textContent 변경
```

### 핵심 차이

| 작업 | DOM (전체 재구축) | VDOM (diff + patch) |
|------|-------------------|---------------------|
| 기존 노드 제거 | ✅ 100개 remove | ❌ 안 함 |
| 새 요소 생성 | ✅ 100× createElement | ❌ 안 함 |
| 속성 설정 | ✅ 100× setAttribute | ❌ 안 함 |
| DOM 트리 삽입 | ✅ 100× appendChild | ❌ 안 함 |
| diff 비교 | ❌ 안 함 | ✅ O(n) 비교 |
| 텍스트 변경 | ❌ (새 노드에 포함) | ✅ 100× textContent |

`createElement` + `appendChild`는 **메모리 할당 + DOM 트리 구조 갱신**을 수반하지만,  
`textContent` 변경은 **기존 텍스트 데이터만 교체**라 훨씬 가볍다.

### DOM을 일부러 느리게 만든 건가?

**일부러는 아니지만, DOM 측이 "가장 비효율적인 방법"을 대표하는 건 사실이다.**

실제 DOM 개발자라면 이렇게 할 수 있다:

```js
// "DOM 타겟 업데이트" — 변경된 항목만 직접 수정
for (let i = 0; i < count; i++) {
  if (shouldUpdate(i)) {
    container.children[i].textContent = newText;
  }
}
```

이 방식은 VDOM과 비슷하거나 더 빠를 수 있다.

### VDOM이 져야 하는 경우 (현재 미측정)

1. **완전 다른 트리 교체** — `<ul>` → `<table>` 구조 변환 시 VDOM도 전체 REPLACE
2. **노드 10개 미만** — diff 오버헤드 > 재생성 비용
3. **초기 렌더링** — 둘 다 전체 생성이므로 VDOM은 diff 오버헤드만큼 불리

### 교육적 의미

이 벤치마크의 진짜 교훈은:

> "VDOM이 무조건 빠르다"가 아니라  
> "VDOM은 개발자가 수동 최적화하지 않아도 자동으로 최적 경로를 찾아준다"

3자 비교를 추가하면 이 메시지를 더 잘 전달할 수 있다:
- DOM (전체 재구축) — 가장 느림
- DOM (타겟 업데이트) — VDOM과 비슷하거나 더 빠름
- VDOM (diff + patch) — **자동화된** 최적 경로
