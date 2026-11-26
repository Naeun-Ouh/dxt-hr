# Issue #47 — 근로계약 요청일·서명 기한 및 목록

## 범위

기존 전자서명 엔진, 직원 snapshot, 본문 버전/hash, Google 인증 증적 및 완료 PDF는 유지한다. 목록 KPI를 상태 필터로 연결하고 직원/이메일/근로계약/날짜 검색, 요청일 범위, 요청일·선택적 서명 기한 열을 제공한다. 날짜는 서울 기준이다. 요청일은 기존 sent_at이며 기존 미발송 계약에 날짜를 만들어 넣지 않는다. 계약 이름은 기존 근로계약·버전 표현을 재사용한다.

서명 기한은 안내용이다. 기한 당일은 초과가 아니며 다음 서울 날짜부터 미완료 서명 진행 계약에 초과를 표시한다. 회사 서명 완료 후 PDF 보관 재시도 대기는 초과로 표시하지 않는다. 기한이 지나도 서명 가능하며 자동 만료, Gmail, cron, 알림 발송을 추가하지 않는다.

## 저장·권한·무결성

새 migration `20261126030449_contract_due_dates_after_routes.sql`만 추가한다. 기존 행의 signing_due_date는 NULL, due_version은 0이다. set_contract_due_date는 관리 capability와 본문 current_version 및 독립 due_version을 검사하고 행 잠금 안에서 수정/감사 이벤트를 저장한다. 날짜 변경으로 본문 버전을 증가시키거나 서명 hash를 바꾸지 않는다. 동일 값은 이벤트를 추가하지 않는다. 완료/취소/거절 및 회사 서명 후 날짜는 변경할 수 없다. 날짜를 비워 저장하면 해제한다. stale 화면은 오류 후 새로고침하도록 안내하며 성공 시 due_version key로 입력을 재설정한다.

선택적인 거절·취소 사유는 기존 상태 전이를 호출하는 원자적 RPC로 별도 append-only 테이블에 암호화 저장한다. 평문은 감사 이벤트에 넣지 않는다. 조회 RLS는 기존 private contract_scope를 재사용한다. 직원 본인(발송 이후)과 민감정보 열람 권한자만 읽으며 일반 ADMIN/Team Leader/다른 직원은 원문을 조회할 수 없다. 기존 사유 없는 상태 전이도 유효하며 사유 입력을 새로운 필수 회사 정책으로 만들지 않는다. 재호출은 원래 사유와 이벤트를 덮어쓰거나 중복 생성하지 않는다. 직원용 목록의 employeeId override도 명시적으로 차단한다.

## 검증

- DB: 기한 변경 역할/버전 검증, 해제, hash/snapshot 불변, 과거 기한 직원 서명, 회사 서명 이후 및 완료 계약 변경 차단.
- DB: 사유 암호화/private RLS, 다른 직원·Team Leader·일반 ADMIN 접근/직원 대신 거절 차단, 재호출 불변, 잘못된 사유의 원자적 롤백, 익명 접근 차단.
- Unit: 서울 자정 경계, 기한 당일/다음날, 종료 상태 및 회사 서명 상태, KPI 그룹.
- Browser: 독립 synthetic 계약으로 날짜 저장/reload, KPI/검색/요청일 필터, 초과 후 직원 서명, 거절 사유 표시 및 일반 ADMIN HTML/RSC 비노출, 다른 직원 접근 차단. `contract-register.spec.ts`.
- 합성 화면 증빙 예정: `docs/screenshots/issue47-contract-register.png`, `issue47-contract-overdue.png`.

로컬 fixture DB/browser 검증과 실제 staging 검증은 구분한다. 실제 staging 적용·Google 로그인·운영 데이터 검증은 이번 작업에서 수행하지 않는다. 전체 회귀/production build/browser/CI는 통합 담당 작업에서 실행 후 결과를 PR에 기록한다.

사유 RPC는 암호문 envelope 구조도 검사한다. 구조가 맞더라도 직접 RPC 호출자가 위조한 ciphertext는 인증 복호화에 실패할 수 있으므로 선택적 사유만 ‘담당자 확인 필요’로 격리한다. 본문/hash의 무결성 검증은 그대로 실패 차단한다. 사유·암호문·오류 내용을 로그에 출력하지 않는다. 동일 due_version으로 경쟁하는 두 관리자 요청은 하나만 반영되는 회귀 테스트를 포함한다.
