# 301호 2팀 

Vanilla JavaScript로 만든 Virtual DOM 데모 프로젝트입니다.  
왼쪽에는 현재 보드, 오른쪽에는 다음에 적용될 가상 보드를 보여주고, 사용자가 만든 변경 사항을 `diff -> patch` 흐름으로 실제 DOM에 반영하는 과정을 시각적으로 확인할 수 있습니다.

이 프로젝트는 단순히 "Virtual DOM이 빠르다"를 말하는 데서 끝나지 않고, 아래 질문에 답할 수 있게 구성되어 있습니다.

- 왜 전체 DOM을 매번 다시 그리면 부담이 커지는가
- Virtual DOM은 어떤 식으로 변경점을 찾아내는가
- 실제 DOM에는 어떤 패치가 적용되는가
- Undo / Redo / Snapshot Jump 같은 상태 이력은 어떻게 관리할 수 있는가
- DOM 방식과 VDOM 방식은 각각 어떤 장점이 있는가

## 폴더 구조

```text
./
├─ index.html
├─ style.css
├─ main.js
├─ serve-local.js
├─ package.json
├─ CONTRACT.md
├─ OPTIMIZED_ENGINE_STUDY_GUIDE.md
├─ SAFETY_CHANGES_KO.md
├─ actual-site/
│  ├─ index.html
│  ├─ app.js
│  └─ styles.css
├─ preview-site/
│  ├─ index.html
│  ├─ app.js
│  └─ styles.css
├─ src/
│  ├─ vdom.js
│  ├─ diff.js
│  ├─ patch.js
│  ├─ benchmark/
│  │  ├─ benchmark-popup.css
│  │  ├─ benchmark-popup.js
│  │  └─ scenarios.js
│  └─ optimized/
│     ├─ diff-keyed.js
│     ├─ index.js
│     ├─ patch-mapped.js
│     └─ vdom-mapped.js
└─ prompts/
```

## 주요 파일 설명

- [`main.js`](./main.js): 메인 호스트 로직, 상태 관리, 히스토리, 시나리오, iframe 통신
- [`actual-site/app.js`](./actual-site/app.js): 실제 보드 렌더링과 patch 하이라이트 처리
- [`preview-site/app.js`](./preview-site/app.js): 다음 상태 미리보기 렌더링
- [`src/vdom.js`](./src/vdom.js): 정규화된 VDOM 변환 유틸
- [`src/diff.js`](./src/diff.js): 기본 diff 알고리즘
- [`src/patch.js`](./src/patch.js): 실제 DOM 패치 적용
- [`src/benchmark/benchmark-popup.js`](./src/benchmark/benchmark-popup.js): DOM vs VDOM 비교 팝업
- [`src/benchmark/scenarios.js`](./src/benchmark/scenarios.js): 벤치마크용 데이터와 시나리오 정의


## 핵심 기능

### 1. 현재 보드 vs 다음 보드 비교

- `actual-site/` iframe: 현재 실제 DOM 상태
- `preview-site/` iframe: 아직 적용되지 않은 다음 VDOM 상태
- 패치를 적용하면 실제 보드에만 변경이 들어가고, 변경 위치는 하이라이트로 표시됩니다.


### 2. 시나리오 버튼

한 번의 클릭으로 대표적인 DOM 변경 케이스를 빠르게 보여줄 수 있습니다.

- 사건명 바꾸기
- 긴급도 바꾸기
- 단서 추가
- 단서 제거
- 보드 태그 바꾸기
- 현재 보드 상태 다시 불러오기

### 3. Patch 적용과 상태 이력

- `변경 반영`: 현재 VDOM과 다음 VDOM을 비교해 patch를 생성하고 실제 DOM에 반영
- `Undo` / `Redo`: 저장된 스냅샷 사이를 이동
- `초기 사건으로`: 첫 상태로 복귀
- `스냅샷 선택`: 특정 이력 상태로 바로 점프

### 4. 내부 상태 시각화

- 현재 상태 표시
- 히스토리 개수 표시
- 생성된 patch 개수 표시
- patch 로그 출력
- 정규화된 VDOM JSON 미리보기
- 변경 요약과 발표용 설명 문장 제공

### 5. DOM vs VDOM 벤치마크 팝업

`⚡ 벤치마크` 버튼을 누르면 DOM 방식과 VDOM 방식을 시각적으로 비교하는 팝업이 열립니다.

- 발표 모드
- 측정 모드
- 카드 밀도 선택(`light`, `medium`, `heavy`)
- 시나리오별 비교
- 어떤 부분이 전체 재조립되는지 / 부분 반영되는지 하이라이트

## 동작 방식

프로젝트의 핵심 흐름은 아래와 같습니다.

1. 초기 화면을 기준으로 정규화된 VDOM을 만든다.
2. 사용자가 폼을 수정하면 "다음 보드" VDOM을 만든다.
3. `diff(currentVDOM, nextVDOM)`로 patch 목록을 계산한다.
4. preview iframe에는 다음 상태 전체를 보여준다.
5. `변경 반영`을 누르면 실제 보드에 patch만 적용한다.
6. 적용이 끝나면 새로운 VDOM 스냅샷을 history에 저장한다.

즉, 이 프로젝트는 "다음 화면 전체를 미리 계산한 뒤, 실제 DOM에는 필요한 부분만 반영"하는 흐름을 눈으로 보여주는 데 초점을 둡니다.

## Patch 타입

이 프로젝트에서 사용하는 기본 patch 타입은 5가지입니다.

- `ADD`: 새 노드 추가
- `REMOVE`: 기존 노드 제거
- `REPLACE`: 노드 타입 자체 교체
- `PROPS_UPDATE`: 속성 변경
- `TEXT_UPDATE`: 텍스트 변경

이 패치들은 [`src/diff.js`](./src/diff.js) 또는 최적화 엔진에서 생성되고, [`src/patch.js`](./src/patch.js)에서 실제 DOM에 반영됩니다.

## 협업
- 김용, 서원규 : `로직 구현`
- 고민석, 김세민 : `프론트엔드 구현`

## 제한 사항

- 프레임워크 기반 프로젝트가 아니라 학습용 / 발표용 Vanilla JS 데모입니다.
- 자동 반응형 상태 관리 라이브러리를 쓰지 않습니다.
- form 요소의 live property보다 attribute snapshot 중심으로 동작합니다.
- keyed diff와 최적화는 실험용 구현이며, 모든 프레임워크 수준 기능을 다 지원하는 것은 아닙니다.
- 브라우저 내부 상태(`focus`, 커서 위치, selection`)를 일반화해서 완벽히 보존하는 엔진은 아닙니다.

## 함께 보면 좋은 문서

- [`CONTRACT.md`](./CONTRACT.md): 구현 계약 및 범위
- [`OPTIMIZED_ENGINE_STUDY_GUIDE.md`](./OPTIMIZED_ENGINE_STUDY_GUIDE.md): 최적화 엔진 학습 가이드
- [`SAFETY_CHANGES_KO.md`](./SAFETY_CHANGES_KO.md): 안전장치와 방어 로직 설명
