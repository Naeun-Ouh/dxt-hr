"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="login-page"><section className="login-card"><h1>잠시 연결이 원활하지 않습니다</h1><p>잠시 후 다시 시도해 주세요.</p><button className="button primary" onClick={reset}>다시 시도</button></section></main>; }
