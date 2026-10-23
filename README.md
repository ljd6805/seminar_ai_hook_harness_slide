# seminar_ai_hook_harness_slide

AI Agent 팀 세미나 시리즈 **3편 — Hook & Harness** 의 발표 자료 저장소입니다.

> **핵심 메시지**: 통제의 목적은 Agent의 자율성을 없애는 것이 아니라, **자율성의 경계를 설계**하는 것이다.

## 시리즈 위치

| 편 | 주제 | 형식 | 저장소 |
|---|---|---|---|
| 1편 | AI Agent 기본 개념 (Agent · Skill · MCP · Harness) | 이론 | [seminar_ai_agent](https://github.com/ljd6805/seminar_ai_agent) |
| 2편 | Skill Quest — Skill 실습 | 게임형 실습 | [seminar_ai_skill_quest](https://github.com/ljd6805/seminar_ai_skill_quest) |
| **3편** | **Hook & Harness** | 이론 + 실습 | 본 저장소 |

## 3편 구성

- **1차 세션 — Harness 이해와 설계** (이론, 90분): 통제되지 않은 Agent에서 출발해 7가지 문제를 목격하고, 각 문제의 답으로 Hook → Record → Policy → State → Limits → Validation → Approval 을 하나씩 도출한 뒤, 마지막에 그 전체 구조가 Harness였음을 확인한다.
- **2차 세션 — Harness Quest** (실습, 별도 기획): 1차에서 본 구조를 참가자가 직접 만든다. 통제되지 않은 Agent 실행 → Hook 추가 → 범위 통제 → 도구 통제 → 실행 제한 → 완료 검증 → 사람 승인 → Harness 완성.

## 문서

새 기획·개발 자료는 [문서 허브](docs/index.html)에서 확인합니다.

| 문서 | 설명 |
|---|---|
| [`docs/seminar-synopsis.md`](docs/seminar-synopsis.md) | 1차 세션 시놉시스 v0.1 — 핵심 메시지, 전개 원칙, 장별 구성, 시간 배분, 데모 계획, 결정 기록. **슬라이드 작성의 기준 문서** |
| [`slides/index.html`](slides/index.html) | 1차 세션 슬라이드 초안 v0.1 — reveal.js 자립형(오프라인 동작), 1·2편과 동일한 테마 상속. `?mode=presentation` 으로 본편·데모만 재생 |
| [`docs/harness-quest-plan.html`](docs/harness-quest-plan.html) | 2차 실습 기획안 v0.2 — OpenCode에서 실제 실행할 미션·권한·Hook·검증·승인, 120분/90분 운영안. 플랫폼은 확정, 세부 구성과 버전은 검토 중 |

### 2차 기획 업데이트 (2026-10-23)

- 사용자는 1차 세션이 완료되었다고 확인했고, 2차는 **실습 기획안부터** 작성하기로 선택했습니다.
- 아래의 기존 진행 상태는 당시 기록입니다. 이번 변경에서는 1차 슬라이드와 시놉시스를 수정하지 않았습니다.
- **2차는 OpenCode에서 진행하는 실습입니다(사용자 확정).** 참가자는 OpenCode에서 요청하고 프로젝트 설정·Hook을 수정하며 실제 도구 실행·검증·승인을 확인합니다.
- 고정 시나리오는 채점용 보조 테스트로만 사용합니다. 별도 시뮬레이터를 본 실습으로 삼고 OpenCode 연결을 선택 사항으로 두던 v0.1 제안은 철회했습니다.
- 운영 시간, 세부 미션, OpenCode 버전·OS·모델과 구현 언어는 검토 중입니다. 초기 시제품부터 실제 OpenCode에서 검증합니다.

## 진행 상태

- [x] 주제 선정 및 2세션 구성 확정
- [x] 1차 세션 논리 구조 확정 (문제 주도형 전개)
- [x] 시놉시스 v0.1 작성
- [x] 1차 세션 슬라이드 초안 v0.1 (21장, 클릭 fragment·리플레이·게이지 애니메이션 포함)
- [ ] 슬라이드 검토·보강 ← **다음 단계**
- [ ] 데모 준비 (opencode plugin: 관찰 Hook / 개입 Hook)
- [ ] 리허설 및 시간 조정
- [ ] 2차 세션 (Harness Quest) 기획

## 작성 원칙

슬라이드는 `docs/seminar-synopsis.md` 의 장 구조를 그대로 따른다. 시놉시스와 슬라이드가 어긋나면 시놉시스를 먼저 갱신한다.
