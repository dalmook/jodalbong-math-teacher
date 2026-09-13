# 일타강사 조달봉 · Codex 구독 음성 산수 교실

v0.3.0 · 성인 본인 테스트 · experimental Codex app-server 0.153.4

기본 화면은 PC에 설치된 **공식 Codex의 ChatGPT 로그인**을 사용합니다. 브라우저에 API 키나 OpenAI 토큰을 입력하지 않습니다. 구독 사용 한도가 적용되며 무제한 사용을 뜻하지 않습니다. 유료 API로 자동 전환하지 않습니다.

## 실행

Node 22 이상과 공식 Codex 설치 및 기존 ChatGPT 로그인이 필요합니다. 저장소에서 `npm start` 또는 `node server.mjs`를 실행하고 **http://127.0.0.1:8775/** 를 여세요. `localhost`는 의도적으로 허용하지 않습니다. Node 외 npm 의존성은 없습니다.

`CODEX_BIN` 기본값은 `codex`입니다. Windows에서 PATH의 npm shim 대신 실제 공식 `codex.exe`의 절대 경로를 지정할 수 있습니다. `PORT` 기본값은 8775이며 항상 127.0.0.1에 바인딩합니다. `.env.example`은 안내용이고 서버는 `.env`를 자동 로드하지 않습니다. 계정 로그인·설정 변경은 이 앱이 수행하지 않습니다.

```powershell
$env:CODEX_BIN = 'C:/path/to/official/codex.exe'
node server.mjs
```

설정에서 로그인 상태와 공식 목소리 목록을 확인하고, 성인 본인 테스트·음성 전송에 동의한 뒤 시작하세요. 목소리 목록 조회에는 마이크나 realtime 세션을 사용하지 않습니다. 시작 시 다시 ChatGPT 인증과 선택한 목소리를 확인한 뒤에만 마이크 권한을 요청합니다. 처음 소리가 막히면 `소리 켜기`를 누르세요.

## 구조와 공식 프로토콜

브라우저 UI → 같은 출처의 Node HTTP 서버 → 설치된 공식 Codex app-server JSON-RPC. 음성은 브라우저 WebRTC로 연결하고, 공식 app-server의 SDP 이벤트를 서버가 전달합니다. 완료 전사와 자막은 `/api/events` POST polling으로 받아 Quick Tunnel의 장시간 SSE 연결 의존성을 없앴습니다. 브라우저는 임의 RPC를 호출할 수 없습니다.

- `initialize`: 실제 앱 이름과 버전, `capabilities.experimentalApi: true`.
- `account/read`: `refreshToken: false`, account type이 `chatgpt`여야 진행.
- **`thread/realtime/listVoices`**: `{}`. 공식 0.153.4의 v3는 **`voices.v1`** 목록을 사용합니다(v2가 아님). 기본 후보는 목록에 있는 `juniper`, 없으면 검증된 `defaultV1`입니다. 목록에는 이름만 있고 성별·따뜻함 메타데이터는 없습니다. 여성 선생님 말투는 prompt로 요청하지만 음색 성별을 보장하지 않습니다.
- `thread/start`: ephemeral, read-only, approvalPolicy never, 환경 비움. OpenAI provider만 허용.
- `thread/realtime/start`: `version: v3`, 선택한 `voice`, `outputModality: audio`, `clientManagedHandoffs: false`, `includeStartupContext: false`, WebRTC SDP와 수업 전용 prompt.
- `thread/realtime/transcript/done`의 `role: user`만 앱의 결정적 명령/숫자 해석으로 전달합니다. 전사 delta나 선생님 말은 채점하지 않습니다. polling 순번으로 중복 실행을 차단합니다.
- 수업 결과와 제한된 공개 상태는 공식 **`thread/realtime/appendText`**, `role: user`의 문맥 자료로 보냅니다. 가짜 provider 함수 호출, `response.create`, `appendSpeech`는 사용하지 않습니다.

공식 참고: [Codex App Server](https://developers.openai.com/codex/app-server), [인증](https://developers.openai.com/codex/auth), [0.153.4 realtime core](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/core/src/realtime_conversation.rs). `default_realtime_voice`와 `validate_realtime_voice`는 v3를 v1 목록에 매핑합니다. 실제 공식 클라이언트에서도 v3 + marin이 지원되지 않는다는 검증 오류를 확인했습니다. 프로토콜 버전 v3는 모델 이름이 아니며 모델 필드는 생략되어 서버 기본 모델을 사용합니다.

## 기존 수업 기능

`engine.js`와 `lesson.js`의 계산·채점 상태기계를 유지했습니다. 칠판, 작은 단계, 그림, 점수, 문제 순서와 마스코트 배치도 유지했습니다.

| 말하는 예 | 앱 동작 |
| --- | --- |
| 모르겠어요 / 더 쉽게 설명해줘 | 작은 단계 등록 |
| 2요 → 삼이요 → 열셋이요 | 8+5의 작은 단계 2, 3, 최종 답 13 채점 |
| 아니, 12라고 했어 | 직전 채점을 되돌린 뒤 정정한 수로 재채점 |
| 힌트 / 답 알려줘 | 최종 답 대신 힌트 |
| 그림으로 / 전체 문제로 | 시각 도구 / 전체 질문 복귀 |
| 다음 문제 / 완료 후 네 | 완료한 문제 다음으로 |
| 건너뛰자 | 명시적 건너뛰기 |
| 곱셈 하자 / 더 어렵게 | 연산 / 난이도 변경 |
| 시도 후 풀이를 배우고 넘어갈래 | 함께 풀이 배우기, 직접 정답 수에 미포함 |
| 그만할래 / 수업 끝 | 마이크와 서버 세션 종료 |

기존 모델 함수 호출 방식과 달리 자연어 의도 해석은 제한된 한국어 규칙입니다. 숫자는 0~999의 명확한 숫자·일부 한국어 수사를 지원합니다. 여러 숫자나 모호한 문장은 임의로 채점하지 않습니다. 자유로운 표현 모두를 이해하거나 모델의 질문과 앱 질문이 항상 일치함을 보장하지 않습니다. 전사가 오지 않으면 칠판도 자동 진행하지 않습니다. 모델은 상태 갱신 전 먼저 말할 수 있고, 문제를 직접 풀어 정답을 노출하거나 잘못 설명할 수 있습니다. 앱의 숨겨진 답을 문맥에서 제외하는 것은 음성 답 노출 방지 보장이 아닙니다.

글 입력도 같은 결정적 수업 동작을 수행하고 `appendText`로 문맥을 추가합니다. **글 입력이 새 음성 응답을 유발한다는 보장은 없습니다.** 인식된 음성은 이미 OpenAI에 전달된 뒤이며, 이후 개인정보 패턴 차단이 최초 음성 전송을 취소하지는 않습니다.

## 수명과 보안

대기 상태에는 Codex 자식 프로세스나 realtime 세션이 없습니다. 목소리 조회 때 잠깐 연 프로세스도 결과·실패·연결 취소 후 닫습니다. 수업은 한 번에 하나이며 소유 브라우저 쿠키와 별도 세션 ID가 모두 맞아야 접근할 수 있습니다.

서버는 정확한 Host/Origin, `X-Voice-Request: 1`, JSON content type, HttpOnly SameSite=Strict 쿠키를 검사합니다. cross-site 요청은 거절합니다. 요청 본문 64 KiB, SDP 50,000자, 전사 이벤트 256개, 브라우저 쿠키 256개로 제한합니다. API 키 관련 환경 변수를 자식에서 제거하고 MCP·shell·파일 이미지 보기·브라우저·플러그인·위임 등 실행 기능을 끕니다. 서버가 보내는 도구/승인 요청은 항상 거절합니다.

heartbeat는 5초마다 보내고 20초 이상 끊기면 정리합니다. 최대 10분, 사용자 활동 없는 2분도 서버가 검사합니다(검사 주기 1초). 종료 요청에는 짧은 응답 대기 후 프로세스 종료를 적용합니다. 오류, 전송 실패, WebRTC 단절, 탭 숨김/이탈, 연결 취소 때 마이크·peer·요청을 정리합니다. 쉬기는 마이크와 재생을 음소거하며 서버 세션과 한도 시간은 유지합니다. 서버의 대화 처리나 구독 사용 중지를 보장하는 pause RPC는 없습니다.

서버는 UI 파일 allowlist만 제공합니다. `.env`, 서버 소스, 테스트, package 파일, 로그와 runtime 파일은 HTTP로 제공하지 않습니다. 대화와 음성은 앱이 파일에 저장하지 않습니다. 진행 중 전사와 상태는 메모리에 있습니다. OpenAI 및 공식 Codex의 저장·로그 정책은 별도이고, ephemeral이 Zero Data Retention 승인을 의미하지 않습니다. 실제 어린이 배포용 서비스는 아닙니다.

## GitHub Pages와 비공개 역방향 프록시

GitHub Pages는 정적 파일만 제공하고 **Codex 백엔드를 실행하지 못합니다**. PC와 Node 서버가 켜져 있어야 합니다. `runtime-config.js`의 `privateService`에 인증된 비공개 HTTPS 서비스 주소를 지정하거나 설정 화면에서 입력하면, 브라우저가 **UI 전체를 그 주소로 이동**합니다. HTTPS만 허용하며 URL의 사용자명·암호·query·fragment를 거절합니다. 인증 토큰이나 비밀을 설정 파일에 넣지 마세요. 기본값은 비어 있습니다.

역방향 프록시는 먼저 자체 인증과 명시적 기기 승인을 끝낸 요청만 받아야 합니다. UI와 `/api/*`를 동일한 HTTPS 출처로 제공하고, 원래 Origin이 그 서비스의 정확한 HTTPS 출처인지 **프록시가 먼저 검사한 후에만**, upstream Host를 `127.0.0.1:8775`, Origin을 `http://127.0.0.1:8775`로 재작성하세요. 포트를 바꿨다면 둘 다 일치시킵니다. 원래 `Sec-Fetch-Site`, 쿠키, `X-Voice-Request`를 보존하고 공개 출처에서 온 요청이나 인증 실패를 재작성해 통과시키지 마세요. HTTPS 응답의 세션 쿠키에는 프록시에서 Secure 속성도 추가하세요.

백엔드는 프록시 인증을 대신 구현하거나 `X-Forwarded-*`를 신뢰하지 않습니다. 인증 없이 터널만 연결하거나 모든 Origin을 무조건 재작성하는 설정은 지원하지 않습니다. CORS wildcard, 공용 bypass, 교차 출처 토큰 전달은 없습니다. 이 작업은 프록시 설치·인증 설정·기기 승인이나 배포를 수행하지 않았습니다. 이미 실행 중인 8765/8766/8767 프로토타입과 설정은 건드리지 않았습니다.

## 테스트와 이전 구현

`npm test`는 Node 테스트를 실제 실행합니다. 기존 48개 회귀 테스트, 수업 명령 실행, 실제 loopback HTTP 보안/수명 테스트, 실제 자식 프로세스 JSON-RPC 테스트(오프라인 fixture), 모의 WebRTC 수명 및 UI wiring 검사를 포함합니다. fixture는 공식 클라이언트나 유료 API를 호출하지 않습니다. 기존 `evidence/`의 v0.2 브라우저 기록은 이전 버전 자료이며 이 구독 구현의 실측 결과가 아닙니다.

2026-09-13 실제 Chromium UI 경로에서 **juniper 선택 → 합성 한국어 입력 → 자율적인 원격 선생님 음성**을 확인했습니다. 곱셈 요청으로 칠판이 바뀌고, 후속 힌트 요청에 맞는 작은 단계와 원격 답변이 이어졌습니다. 원격 수신 음성을 FFmpeg로 전체 디코딩: 24 kHz 1,045,440 samples, peak 13,014, RMS 1067.807. 실제 RTP 송수신, 음소거/재개, 트랙 종료·peer close, 공식 stop 응답과 프로세스 종료·서버 idle을 확인했습니다. 입력만 합성했고 출력은 로컬 TTS나 `appendSpeech`가 아닙니다.

**92개 자동 테스트 통과.** 실제 브라우저 360/390/430/1440px에서 수평 넘침 없음, 키 입력란 없음, 기본 juniper, 동의 전 마이크 요청 없음도 확인했습니다. 비식별 측정 요약: [`evidence/subscription-validation.json`](evidence/subscription-validation.json). 녹음, 전사, 원시 SDP, 세션 ID 및 실행 로그는 저장소에 포함하지 않았습니다.

실제 사람 마이크·스피커, Safari/물리 휴대폰, 공개 배포의 인증 프록시는 미검증입니다. 목소리를 직접 듣고 여성적/친근하다고 판정한 것은 아닙니다. 이 검증은 로그인된 본인 계정의 실험적 개인 사용 경로이며 일반 상용 임베딩 SDK 보장이 아닙니다.

`legacy.html`은 명시적으로 여는 이전 유료 API 방식입니다. `app.js`, `api.js`, `style.css`를 유지하며 기본 화면에서 불러오지 않습니다. 이전 realtime transport는 `legacy-realtime.js`로 보존하고 기존 테스트만 그 파일을 import합니다. 기본 `realtime.js`는 구독 전용입니다. 브랜치는 `feat/codex-subscription-voice`입니다. 기존 Pages의 main 배포를 자동 교체하지 않으며, 구독 음성은 별도로 실행한 비공개 Node 서비스에서 사용합니다.
