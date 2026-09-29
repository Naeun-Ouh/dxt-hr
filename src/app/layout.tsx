import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "DXT People & Operations", template: "%s · DXT" },
  description: "디엑스티 임직원 운영 관리 시스템", robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body>{children}</body></html>; }
