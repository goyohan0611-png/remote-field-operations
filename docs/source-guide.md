# 소스 안내와 실행 범위

## 기존 UI를 그대로 활용한 부분

`apps/desktop/src/main.tsx`와 `components/`, `features/`, `styles.css`는 기존 관리 프로그램에서 분리했습니다. 현장 목록·모니터링·녹화 이력·파일 목록·설정 대화상자 등 원래 화면을 유지합니다. 회사명·로고·운영 도메인을 교체하고, 자동 로그인 대신 가상 사용자로 바로 열리도록 진입부를 변경했습니다. 기존 외부 글꼴 바이너리는 배포하지 않고 시스템 글꼴을 사용합니다.

`src/demo/bootstrap.ts`는 axios와 Electron 브리지를 데모 응답으로 대체합니다. `src/demo/socket.ts`는 실제 Socket.IO 연결을 만들지 않습니다. `src/go2rtc.ts`도 장비의 영상 중계에 접속하지 않습니다. 지원하지 않는 작업에는 성공 결과를 꾸며내지 않고 데모 안내를 반환합니다.

## 기존 핵심 구현을 포함한 부분

| 파일 | 읽을 수 있는 내용 | 기본 실행에서 사용 |
| --- | --- | --- |
| `apps/server/implementation/tailscale.ts` | 서버 측 OAuth 토큰 재사용, 단기 일회용 키 요청, 태그 검증, 시간 제한 | 아니요 |
| `apps/server/implementation/agent-command-broker.ts` | 갱신 요청 병합, 요청 ID 일치, 장기 대기와 취소·시간 제한 | 아니요 |
| `apps/server/implementation/agent-freshness.ts` | 오래된 측정을 정상으로 표시하지 않는 정책 | 아니요 |
| `apps/server/implementation/agent-input.ts` | 보고된 상태 값·버전·주소 입력 검증 | 아니요 |
| `apps/server/implementation/agent-network.ts` | 관측 IP 정규화, IP 변경 확인, 현장 장애 유형 구분 | 아니요 |
| `apps/server/implementation/agent-update-version.ts` | 업데이트 버전 비교 | 아니요 |
| `apps/desktop/implementation/camera-proxy.cjs` | 루프백 IPv4에서 받아 IPv6 목적지로 TCP 전달, 종료 처리 | 아니요 |
| `packages/shared/src/index.ts` | 공통 데이터 계약과 현장 ID·IPv4를 사용하는 4via6 계산 | 예 |
| `packages/shared/src/ftp-delete.cts` | 삭제 범위·지문·제한 검사 구현 | 타입만 참조, 삭제 실행 없음 |
| `apps/agent/Core/AgentModels.cs` | 등록·heartbeat·명령·장비 상태 데이터 계약 | 가상 상태 모델 사용 |
| `apps/agent/Core/AgentRuntime.cs` | HTTPS 정책, heartbeat 간격과 재시도 지연 | 예 |
| `apps/agent/Core/RecordingTail.cs` | 로그 교체·절단·인코딩·미완성 줄을 처리하는 증분 읽기 | 아니요 |

이 코드는 식별정보를 제거한 선별 구현입니다. 원래 서버·에이전트 전체를 옮긴 운영 배포본은 아닙니다. `SOURCE-MAP.json`은 포함한 소스의 범위만 기록하며 원본 저장소 위치와 Git 이력은 제공하지 않습니다.

## 새로 구성한 데모 실행부

```text
기본 모드
React UI → axios 데모 어댑터 → 메모리 저장소

선택적 로컬 통합 모드
.NET 가상 에이전트 → 127.0.0.1:4177 메모리 서버 ← React UI
                     가상 현장 1 상태 보관         3초 간격 조회
```

기본 모드와 로컬 서버는 같은 `demo-store.mjs`를 사용합니다. UI의 파일 목록은 양쪽 모드에서 합성 데이터로 제공됩니다. 브라우저 메모와 노트는 메모리에만 추가되며 실제 문서나 파일을 만들지 않습니다. 실제 서비스 인증·등록키 발급·업데이트·파일 삭제·카메라 제어 기능은 연결되어 있지 않습니다.

별도 데모 서버는 루프백에만 열리고 지정한 로컬 UI의 Origin만 허용합니다. 외부 배포나 사내 공용망 서비스로 사용하지 않습니다. 실제 운영 인증 체계는 포함하지 않았으며, 데모의 가상 관리자는 접근 권한 구현 사례가 아닙니다.

## 검증 명령

```sh
npm run typecheck
npm test
npm run build
dotnet build apps/agent/Fieldlink.DemoAgent.csproj
dotnet run --project apps/agent/Fieldlink.DemoAgent.csproj -- --self-test
```

실제 OAuth 키 발급이나 장비 조작을 시험하는 명령은 포함하지 않습니다.
