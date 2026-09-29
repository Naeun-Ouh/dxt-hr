import { Brand } from "@/components/brand";
import { authConfig } from "@/lib/auth/config";
import { safeReturnPath } from "@/lib/routes";
import { signIn, signOut } from "./actions";
export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const configured = Boolean(authConfig());
  return <main className="login-page"><section className="login-card">
    <Brand /><h1>함께 일하는 곳, DXT</h1><p>회사 Google 계정으로 로그인해 주세요.</p>
    <p className="login-note">등록된 재직자만 이용할 수 있습니다. 접근이 되지 않으면 관리자에게 문의해 주세요.</p>
    {query.error && <p role="alert" className="notice">{query.error === "signout" ? "로그아웃하지 못했습니다. 다시 시도해 주세요." : "로그인하지 못했습니다. 다시 시도해 주세요."}</p>}
    {configured ? <form action={signIn}><input type="hidden" name="next" value={safeReturnPath(query.next)} /><button className="button primary" type="submit">Google 계정으로 로그인</button></form> : <p role="status" className="notice">로그인 연결을 준비하고 있습니다. 관리자에게 문의해 주세요.</p>}
    {configured && <form action={signOut}><button className="text-button" type="submit">현재 계정 로그아웃</button></form>}
  </section></main>;
}
