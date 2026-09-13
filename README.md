# 일타강사 조달봉 · 산수 AI 선생님

**v0.1.0 · 성인 본인 개발 테스트용 · 2026-09-13**

**실행: https://dalmook.github.io/jodalbong-math-teacher/**

기존 점핑배틀·달봉 퀴즈섬과 분리된 정적 사이트입니다. 별도 서버·로그인·설치 없이 본인의 OpenAI API 키로 테스트합니다. 기존 운영 코드나 데이터베이스는 연결하거나 변경하지 않았습니다.

## 시작하기

1. 휴대폰 Chrome 또는 Safari에서 실행 주소를 엽니다.
2. 본인 OpenAI API 키를 입력하고 성인 테스트·전송·사용료 안내를 확인합니다. 키를 채팅이나 GitHub에 적지 마세요.
3. `키 적용하고 수업 시작`을 누릅니다. 첫 요청 성공 시 연결 확인 상태가 됩니다.
4. 숫자판으로 풀거나 `눌러서 생각 말하기`를 누릅니다. 마이크 권한을 허용하고 말한 뒤 다시 눌러 종료합니다. 최대 12초입니다.
5. 인식된 글을 확인하고 ↑를 눌러 보냅니다. 숫자 답변은 답 칸에 넣을 뿐 자동 채점하지 않습니다. `확인하기`로 제출합니다.
6. 소리가 안 들리면 말풍선의 ▷를 눌러 주세요. 끝나면 `종료 · 키 지우기`를 누릅니다. 새로고침 시 키 재입력이 필요합니다.

`키 없이 화면 먼저 체험`은 정해진 규칙 기반 미리보기이며 GPT나 음성을 호출하지 않습니다.

## 수업과 답 공개 규칙

덧셈·뺄셈·곱셈·나눗셈, 기초/도전, 한 수업 5문제입니다. 나눗셈은 나누어떨어지는 자연수 문제입니다.

첫 문제 `8 + 5`: `8에 얼마를 더하면 10일까?` → `5에서 방금 쓴 수를 빼면 얼마가 남을까?` → 전체 답 직접 입력.

- 틀린 답을 반복 제출해도 최종 답을 자동 공개하지 않습니다.
- 생각 질문, 3단계 힌트, 작은 단계, 물건 세기·그릇에 나누기 도구를 제공합니다.
- 정답을 맞힌 뒤 풀이를 설명합니다. 계속 막히면 확인창을 거쳐 `풀이 배우기`로 전환할 수 있습니다. 이 경우 직접 푼 문제로 세지 않습니다.
- 랭킹·점수 서버·회원·결제는 없고 기록은 현재 탭에만 있습니다.

## AI 구조 — Realtime 자유대화가 아닙니다

| 역할 | 처리 |
|---|---|
| 생각 이해·지도 행동 선택 | `gpt-4.1-mini`, Responses API, strict JSON schema, `store:false` |
| 음성 인식 | `gpt-4o-mini-transcribe`, 최대 12초, 한국어 |
| 선생님 음성 | `gpt-4o-mini-tts`, coral |
| 생성·채점·중간 단계·풀이 공개 | 앱의 결정적 코드 |

GPT는 `ask_thinking / hint / micro_step / visualize / encourage / repeat / redirect / safety` 중 한 행동과 허용된 초점만 고릅니다. 앱이 검사한 뒤 앱의 지도 문장을 표시하고 읽습니다. **원문 AI 자유출력은 표시하거나 TTS에 전달하지 않습니다.** 추가 정답 필드·설명·HTML·알 수 없는 행동은 거절합니다.

풀기 전 최종 답·해설·중간 단계의 정답은 GPT 요청에 넣지 않습니다. 모델이 문제 자체를 계산할 수 없다는 뜻이 아니며, 출력 허용목록으로 실제 화면·음성 동작을 제한합니다. 대화·표현 다양성은 제한적이고 TTS까지 완전 무오류를 보장하지 않습니다. 정적 소스에서 정답을 확인할 수 있으므로 시험 보안 시스템도 아닙니다.

모델은 `api.js`의 `MODELS`에서 확인합니다. `gpt-4o-mini-transcribe`는 확인 당시 지원 중이나 종료 예정일이 2027-02-26으로 안내되어 장기 운영 전 교체가 필요합니다. 최신 상태는 공식 문서에서 확인하세요.

## 키·개인정보·아동 보호

**성인이 직접 테스트하는 버전입니다. 실제 어린이 음성·이름·전화번호는 입력하지 마세요.** 어린이용 서비스 출시 전 별도 안전·데이터 설계가 필요합니다.

OpenAI의 13세 미만 또는 적용되는 디지털 동의 연령 미만 아동 개인정보 처리 요구사항에는 Zero Data Retention이 포함됩니다. `store:false`나 보호자가 옆에 있는 것만으로 이를 충족하지 않습니다.

키는 클래스 private 필드에만 보관하고 localStorage·sessionStorage·쿠키·URL에 저장하지 않습니다. 입력창도 비웁니다. 인증 헤더로 OpenAI에 직접 전송되며 GitHub에 저장되지 않습니다. **브라우저 직접 키 입력은 본인 임시 테스트용이고 운영용 보안 구조가 아닙니다.** 정식 서비스에는 서버 측 키 보관·인증·권한·비용 제어가 필요합니다.

녹음은 음성 인식을 위해 OpenAI로 먼저 전송됩니다. 인식 글 확인은 이 첫 전송을 막는 기능이 아닙니다. 앱은 녹음·대화 파일을 저장하지 않지만 API 제공자의 기본 보관 정책은 별개입니다. `store:false`는 승인된 Zero Data Retention을 대신하지 않습니다.

외부 분석 도구·CDN·카메라·위치 수집은 없습니다. 알려진 전화번호·이메일·주민등록번호 형식·API 키가 텍스트에 있으면 다음 요청을 차단하지만 모든 개인정보를 탐지하지는 못합니다.

탭이 숨겨지면 녹음·재생·요청을 중단합니다. 종료·이탈 시 키를 지우고 15분 미사용 시 자동 종료합니다. 요청 제한은 25초, 자동 재시도 없음, 세션당 최대 120회입니다. **계정 전체 비용의 확정 상한이 아닙니다.** 사용료는 OpenAI 대시보드에서 확인하세요.

## 검증

`npm test`: **31개 통과**. 4연산 × 2수준 × 500개 = 4,000개 생성 문제의 계산 일관성 포함.

Chromium DOM/CSS/컨트롤러 및 가짜 API 모의 테스트: **22개 통과**. 작은 단계, 정답 공개, 키 삭제, 음성인식 확인, 답 주입 차단, 360·390·430·1440 너비를 검사했습니다. 상세 브라우저 테스트 코드·보고서·스크린샷은 함께 제공한 소스 ZIP에 포함합니다.

실행 환경의 브라우저 탐색 제한 때문에 같은 소스를 직접 로드한 오프라인 fixture로 검사했습니다. 배포 출처의 CSP/ES module 네트워크 통합을 브라우저로 끝까지 검증한 것은 아닙니다. 실제 OpenAI 키·유료 응답·음성 품질·휴대폰 마이크·iPhone/Safari는 미검증입니다. HTTP 배포 확인과 브라우저 모의 검증을 구분합니다.

## 실행과 파일

빌드나 npm 의존성 없이 정적 호스팅합니다. `npm test`로 단위 테스트, `python -m http.server 4173`으로 로컬 실행합니다. 다른 휴대폰의 마이크는 HTTPS 실행 주소를 사용하세요.

`index.html` UI / `style.css` 스타일·CSS 캐릭터 / `engine.js` 문제·지도·채점 / `api.js` 키·STT·JSON·TTS / `app.js` 화면·녹음·상태 제어.

## 공식 참고

- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/models/gpt-4.1-mini
- https://developers.openai.com/api/docs/guides/speech-to-text
- https://developers.openai.com/api/docs/guides/text-to-speech
- https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
- https://developers.openai.com/api/docs/guides/your-data
- https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety
- https://developers.openai.com/api/docs/changelog
