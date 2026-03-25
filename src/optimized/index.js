/**
 * 최적화 VDOM 모듈 — 단일 진입점
 *
 * 사용법:
 *   import { diffKeyed, applyPatchesMapped, vdomToDomMapped } from "../optimized/index.js";
 *
 * 제거 방법: src/optimized/ 폴더 삭제 + import 문 제거
 */

export { vdomToDomMapped } from "./vdom-mapped.js";
export { diff as diffKeyed } from "./diff-keyed.js";
export { applyPatchesMapped } from "./patch-mapped.js";
