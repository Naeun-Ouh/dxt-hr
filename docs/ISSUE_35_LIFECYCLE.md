# Issue 35 — 입퇴사 업무 연결

기준 main `086fe57`, GPT checkpoint `7178153883`. 독립적인 기존 업무 통합이며 Phase 4B 정책 또는 staging UAT 완료를 의미하지 않는다.

## 제공 범위

- `/admin/lifecycle`: 온보딩/오프보딩의 진행·완료 목록, 이름/직책 검색, 업무/상태 필터, 남은 기존 확인 항목, 기존 체크리스트 바로가기.
- `/admin/lifecycle/[employeeId]`: 직원 카드, 기존 task 상태/담당자 수정 화면, 장비 현재 보유 및 송신 인계 대기, 근로계약 운영 상태, 별도 권한 있는 인사서류 종류별 개수, 휴가 원장 연결.
- 기존 task memo, 암호화 본문, 서명 증적, 문서 원본/경로, 사직서 파일명/퇴사 사유는 조회하지 않는다. 민감 내용은 기존 권한 검사 화면에서만 확인한다.

## 권한 / 무변경 원칙

화면은 ONBOARDING_MANAGE로 진입하고 각 업무 및 연결 도메인의 capability를 서버에서 다시 검사한다. 집계는 일반 사용자 세션을 사용하며 기존 PostgreSQL RLS를 그대로 적용한다. 직원 UUID는 권한을 부여하지 않는다. TEAM_LEADER/IT_ADMIN/EXPENSE_ADMIN/DIVISION_HEAD/복합 specialist는 입퇴사 업무에 접근할 수 없다. 일반 ADMIN은 PRIVATE_HR_ACCESS 없는 직원 인사서류 개수도 조회하지 않는다. CEO 전용 사직서/사유는 지정 ADMIN에게도 노출하지 않는다.

새 table/migration/RPC/capability/저장 상태가 없다. 읽기 전용 통합 화면이며 기존 업무 화면의 명시적 처리와 감사 이력을 재사용한다. 자동 계정 생성/비활성화, 자동 장비 회수, 급여/휴가 원장 쓰기, Gmail/cron 활성화가 없다.

`완료 검토 가능`은 화면에 읽힌 기존 조건의 요약이며 완료 확정이 아니다. 기존 save_operation_case RPC가 최종 저장 시 최신 버전/체크리스트/퇴사일 도래/사직서 수령/미사용 휴가 확인을 재검증한다. 명시적 기존 퇴사 완료 시 INACTIVE 전환 정책은 그대로다. 장비 미반납/계약 상태/인사서류 유무는 새로운 차단 조건이 아니다. 보존기간이나 실제 급여 정산 정책은 새로 정하지 않는다.

## 조회 / UI

DXT Design System v2 PageHeader/WorkToolbar/DataTable/StatusTag와 기존 compact sidebar를 재사용한다. 필터는 로컬 state이며 추가 검색 요청을 발생시키지 않는다. task 조회는 허용 case IDs를 64개씩 묶고 ID 정렬로 500행 페이지를 읽는다. 직원 상세의 연결 정보는 직원 ID로 제한하고 필요한 최소 column만 조회한다. Storage URL과 private payload는 client에 전달하지 않는다.

## 검증

`tests/lifecycle.test.ts`: 실제 DB RLS projection, cross-user/Team Leader/specialist 차단, 일반/지정 ADMIN의 CEO-only 정보 차단, 계약 메타데이터와 private 본문 분리, 조회/차단 시 직원 상태 불변, 기존 readiness 조건.

`tests/e2e/lifecycle.spec.ts`: queue→직원→기존 task 편집 링크, ordinary/designated ADMIN 차이, 직접 URL/RSC 거절, synthetic screenshot. 최종 build/browser/전체 회귀는 통합 담당자가 실행한다. 로컬 mock/PGlite 결과와 실제 hosted 사용자 UAT는 구분한다.
