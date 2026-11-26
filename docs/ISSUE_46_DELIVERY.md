# Issue #46 — 경비 유형별 작업 공간과 개인 이동 경로

## 구현 범위

`/expenses`의 전체 / 일반 경비 / 유류비 / 통행료 탭과 유형별 금액 버튼은 같은 React 작업 사본을 필터링합니다. 선택 행, 검증, 카드 식별 snapshot, Excel 원본 provenance, 월별 첨부, 일괄 저장 및 월 제출은 기존 경계를 유지합니다. 탭별 별도 claim이나 승인 단계는 없습니다.

유류비·통행료 표는 경로 선택, 출발지, 도착지, 이동 프로젝트/출장명, 편도 금액, 횟수, 날짜, 계산금액, 결제수단을 표시합니다. 사용처·사용내역·계정과목·관련 프로젝트·증빙 종류·비고는 기존 이동 상세 drawer에서 수정합니다. 저장되는 값은 기존 `expense_item` / `vehicle_travel_detail`이며 계산식은 그대로 편도 금액 × 횟수입니다. Excel 붙여넣기는 원래 열 인덱스를 사용하고 유형 필터 중에는 새 행에 추가합니다. 전체 탭에서 모든 가져온 행을 확인할 수 있습니다.

월별 내역은 본인 claim의 최소 메타데이터로 구성합니다. 미저장 변경이 있으면 저장 후 월 이동 또는 계속 작성만 선택할 수 있습니다. 저장 오류 시 이동하지 않으며 선택한 첨부파일은 먼저 업로드하거나 파일 선택을 취소해야 합니다. 로컬 영구 저장/브라우저 캐시에 경비를 복제하지 않습니다. 브라우저 새로고침/종료는 기존 unload 경고로 보호합니다.

## 데이터와 보안

CLI로 생성한 새 migration: `20261126024427_expense_route_presets.sql`.

- `expense_route_preset`: 본인 employee FK, 출발지/도착지/별칭, 선택적 유류비·통행료 편도금액, active/version, 서버 시각.
- SELECT RLS는 `current_employee_id()`만 허용합니다. ADMIN/CEO/팀장도 타인의 개인 경로를 읽거나 수정할 수 없습니다.
- 직접 INSERT/UPDATE/DELETE 및 anon 권한 없음. `save_expense_route_preset`은 auth에서 직원 identity를 다시 구하고 허용된 입력 필드와 소유자/version을 검증합니다. 서버 action도 본인 목록과 ID를 확인합니다.
- 경로 변경·비활성화는 기존 append-only audit에 actor/action/id만 기록합니다. 원본 경로 값은 감사 로그에 출력하지 않습니다.
- 선택 시 경로 값은 현재 편집 중인 이동 행으로 복사됩니다. 경비 행에 경로 FK를 저장하지 않으므로 경로 수정·비활성화가 과거 경비 내용을 바꿀 수 없습니다. 거리는 추정하지 않고 유가/API/차량 추적을 추가하지 않습니다.
- 기존 경비 owner/server authorization, RLS, DB 재계산, 카드 snapshot, 참석자 한도, 지급/잠금 규칙을 재사용합니다.

## 월별 증빙 무결성과 hosted 전송 한도

제출된 claim의 마지막 ready 증빙은 삭제할 수 없습니다. 교체 파일을 reserve/upload/finish한 다음 이전 파일을 삭제해야 합니다. pending 파일은 교체 증빙으로 인정하지 않습니다. `remove_expense_attachment`는 claim row lock 아래에서 ready 개수를 확인하여 제출/지급/동시 삭제와 직렬화합니다. 반복 삭제는 추가 audit을 만들지 않습니다. 직접 Storage 삭제·덮어쓰기 권한은 추가하지 않습니다.

신규 증빙은 **파일당 4 MiB**, 웹 요청별 파일 합계 **4 MiB**로 제한하고 여러 파일은 이 크기 내 batch로 전송합니다. 이는 hosted 요청 제한에 multipart/action metadata 여유를 두기 위한 전송 제한입니다. Excel 웹 업로드도 4 MiB이며 호환 Import 화면의 Excel+증빙 합계가 4 MiB를 넘으면 월별 Grid에서 나눠 업로드하도록 안내합니다. 클라이언트 사전 검사, 서버 검사, 신규 증빙 예약 RPC가 함께 제한합니다.

기존 10 MiB 파일은 수정하거나 삭제하지 않습니다. 기존 bucket의 10 MiB metadata/DB 역사적 파일 크기 제약도 유지하며 과거 파일 다운로드는 계속 허용됩니다. 월별 20개/100MB 한도와 Private Storage 정책은 유지합니다. 원본 10 MiB 업로드 지원 또는 직접 signed-upload 전환을 완료했다고 주장하지 않습니다.

## 검증 및 확인할 화면

신규 단위/DB 검증: 개인 경로 cross-user/Admin/CEO/Team Leader/anon 거부, 위조 owner 필드·직접 쓰기·stale version 거부, 명시적 복사와 과거 이동내역 보존, 지급 이후 저장 거부, 마지막 ready 증빙 삭제 거부, pending 교체 거부, 교체 완료 후 삭제, replay audit, 직접 Storage 삭제 거부, 전송 한도/기존 대용량 파일 호환성.

브라우저 파일: `tests/e2e/expense-routes.spec.ts`.
- 혼합 유형 행 편집·선택 → 탭 이동 → 일괄 저장/reload → 개인 경로 변경 후 과거 행 유지.
- 월 변경 취소 및 저장 후 이동·월별 내역 복귀.
- 마지막 증빙 교체 순서와 RPC 차단, 4 MiB 초과 사전 차단, role-switch 후 경로 수정 거부.
- 스크린샷: `docs/screenshots/issue46-route-manager.png`, `docs/screenshots/issue46-fuel-grid.png`.

로컬 합성 데이터 검증과 실제 staging UAT는 별개입니다. Google OAuth와 자동 Gmail/cron 비활성 상태는 변경하지 않습니다. hosted DB/Storage는 이 작업에서 변경하지 않았습니다.

작업 브랜치 사전 검사: 신규 경로/증빙 5개 단위·DB 테스트 및 기존 카드·월별 증빙을 합한 13개 테스트 통과. Typecheck와 변경 파일 lint 통과. 최종 통합 build/browser/CI와 스크린샷은 통합 브랜치에서 별도 실행합니다. 경쟁 삭제 요청 테스트는 단일 연결 PGlite의 직렬화 조건이며 hosted 다중 연결 부하 검증을 대신하지 않습니다.
