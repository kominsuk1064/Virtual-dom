# Mini Virtual DOM Playground

Vanilla JavaScript로 Virtual DOM, Diff, Patch, Undo/Redo 흐름을 직접 구현하고 시각적으로 검증하는 팀 프로젝트입니다.

## Goal

- 실제 영역 DOM을 Virtual DOM으로 변환합니다.
- 테스트 영역의 수정 내용을 새 Virtual DOM으로 만든 뒤 이전 상태와 diff 합니다.
- 변경된 부분만 실제 영역에 patch 합니다.
- 상태 이력을 저장하고 undo / redo 를 지원합니다.

## Tech Stack

- HTML
- CSS
- JavaScript (Vanilla)

## Structure

```text
mini-virtual-dom-playground/
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

## Team Workflow

- 저장소 소유자는 upstream 레포를 관리합니다.
- 팀원은 각자 fork 에서 작업 후 PR 을 생성합니다.
- 기능 분업보다 파일 소유권 분리를 우선합니다.
- 공통 계약은 [CONTRACT.md](./CONTRACT.md)를 기준으로 맞춥니다.

## Getting Started

정적 파일 프로젝트이므로 `index.html`을 브라우저에서 열어도 되고, 로컬 서버를 사용해도 됩니다.

예시:

```bash
# VS Code Live Server 또는 아무 정적 서버 사용
```

## Next Steps

- `src/vdom.js`에 DOM <-> VDOM 변환 구현
- `src/diff.js`에 5가지 diff 케이스 구현
- `src/patch.js`에 부분 DOM 반영 구현
- `main.js`에 상태 이력과 버튼 이벤트 연결
- README에 발표용 설명과 테스트 결과 정리
