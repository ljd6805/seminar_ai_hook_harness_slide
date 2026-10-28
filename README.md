# seminar_ai_hook_harness_slide

AI Agent 팀 세미나 **3편 — Hook & Harness**의 이론 자료와 OpenCode 실습 키트입니다.

> 통제의 목적은 Agent의 자율성을 없애는 것이 아니라, 자율성의 경계를 설계하는 것이다.

## 시리즈 위치

| 편 | 주제 | 형식 | 저장소 |
|---|---|---|---|
| 1편 | AI Agent 기본 개념 | 이론 | [seminar_ai_agent](https://github.com/ljd6805/seminar_ai_agent) |
| 2편 | Skill Quest | 게임형 실습 | [seminar_ai_skill_quest](https://github.com/ljd6805/seminar_ai_skill_quest) |
| **3편** | **Hook & Harness** | 이론 + OpenCode 실습 | 본 저장소 |

1차 이론 세션은 완료됐습니다(사용자 확인). 2차 **Harness Quest**는 OpenCode에서 실제 도구 호출, 파일 변경, Hook, 검증, 승인 흐름을 경험하는 실습입니다.

## 실습 시작

실습 키트는 `main`에 있으며 [공개 문서 허브](https://ljd6805.github.io/seminar_ai_hook_harness_slide/docs/)에서 교재를 볼 수 있습니다. 수업 기준은 **OpenCode 1.19.4**, Node.js 22 이상입니다. 참가자가 사용할 모델을 OpenCode에 연결해 두어야 합니다.

```sh
git clone https://github.com/ljd6805/seminar_ai_hook_harness_slide.git
cd seminar_ai_hook_harness_slide
npm install -g opencode-ai@1.19.4
node quest/cli.mjs init workshops/quest --level 0
npm install --prefix workshops/quest/.opencode
cd workshops/quest
opencode
```

활성 Agent가 `quest`인지 확인하세요. [참가자 교재](docs/harness-quest-guide.html)의 요청을 입력하고 `learner/rules.mjs`를 단계별로 완성합니다. 코드 작성은 저장소 루트의 별도 OpenCode 작성 세션 또는 편집기에서 진행합니다. 실습용 quest Agent는 정책 파일을 수정할 수 없습니다.

레벨을 바꿀 때는 OpenCode를 종료한 뒤 **저장소 루트**에서 실행합니다.

```sh
node quest/cli.mjs checkpoint workshops/quest --level 1
# 해당 규칙을 수정한 뒤 로컬 검사
node quest/cli.mjs check workshops/quest
# 실습 폴더에서 OpenCode를 재시작하고 새 세션으로 미션 수행 후
node quest/cli.mjs check workshops/quest --evidence
```

체크포인트는 기존 규칙을 백업하고 이전 단계 완성 예제와 현재 단계 시작 코드를 제공합니다. 산출물은 보존합니다. 전체 초기화는 새 폴더에 `init`으로 진행하세요. 승인 실습에서는 자동 승인 옵션이나 ‘항상 허용’을 사용하지 않습니다.

## 레벨

| 레벨 | 완성할 내용 |
|---|---|
| Lv.0 | 잘못된 합계를 완료로 처리하는 문제 관찰 |
| Lv.1 | 실제 Hook의 호출 전후 기록 |
| Lv.2 | 파일 읽기·쓰기 범위 |
| Lv.3 | 도구 허용 목록 |
| Lv.4 | 세션별 도구 시도 예산 |
| Lv.5 | 실제 산출물 검증과 수정·재검사 |
| Lv.6 | 검증 해시 확인, OpenCode 승인·거절, 단일 제출 |

합계는 13000원입니다. 업무 파일은 실제로 읽고 쓰며, 외부 제출은 로컬 영수증 생성으로 한정합니다. 고정 응답 서버는 실행기 연동 테스트에만 사용합니다.

## 문서

[문서 허브](docs/index.html)에서 전체 자료를 확인합니다. 새 기획·설계·개발·교육·검증 문서는 HTML입니다.

| 문서 | 용도 |
|---|---|
| [참가자 교재](docs/harness-quest-guide.html) | 단계별 명령·OpenCode 요청·힌트·통과 기준 |
| [강사용 가이드](docs/harness-quest-instructor.html) | 120분/90분 운영안·관찰 질문·리허설 |
| [구현 설계](docs/harness-quest-design.html) | 실행 구조와 설계 결정 |
| [개발 구조](docs/harness-quest-development.html) | 모듈·상태·API·공식 소스·재현 명령 |
| [검증 결과](docs/harness-quest-validation.html) | 자동 검사 결과와 미확인 항목 |
| [트러블슈팅](docs/harness-quest-troubleshooting.html) | 증상별 확인·복구 절차 |
| [기획안 v0.2](docs/harness-quest-plan.html) | 구현 전 기획 기록. 실행 절차는 교재를 우선 |
| [실험실 학습 가이드](slides/lab-guide.html) | Hook·Harness 실험실 사용법 32장: 준비·화면 읽기·첫 실행·실험 5가지·고급 미션 8개 |
| [1차 슬라이드](slides/index.html) | 기존 21장, `?mode=presentation`으로 본편·데모 재생 |
| [기존 시놉시스](docs/seminar-synopsis.md) | 1차 세션 구성의 기준 문서 |

## 개발 검증

```sh
npm test
npm run check:source
npm run check:docs
```

단위 테스트 16개가 통과했습니다. 실제 OpenCode 1.19.4 실행기에서 고정 응답 제공자와 프로그램 방식의 승인 응답으로 5개 연동 시나리오를 통과했습니다. 최종 규칙 검사 19개와 실행 증거 4개도 통과했습니다.

**실제 모델과 사람이 조작하는 승인 화면, 수업 시간, Windows/macOS는 아직 리허설하지 않았습니다.** HTML은 구조와 링크를 정적으로 검사했으며 브라우저 시각 검증은 남아 있습니다. [검증 기록](docs/harness-quest-validation.html)에서 재현 방법과 원본 출력을 확인하세요.

이 키트는 신뢰하는 수업 참가자를 위한 학습 도구입니다. 정책·로그 변조 방지나 OS 격리를 제공하는 보안 제품은 아닙니다. 원본 1차 슬라이드와 시놉시스는 수정하지 않았습니다.
