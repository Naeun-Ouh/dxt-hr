import Link from "next/link";
export default function NotFound() { return <main className="login-page"><section className="login-card"><h1>페이지를 찾을 수 없습니다</h1><p>주소를 확인하거나 이용 권한을 관리자에게 문의해 주세요.</p><Link href="/" className="button primary">홈으로 돌아가기</Link></section></main>; }
