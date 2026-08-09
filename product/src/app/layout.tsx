import type { Metadata } from "next";
import { T003BridgeHost } from "@/components/bridge-hosts";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Living Reader · 正式入口",
  description:
    "《国富论》可执行阅读正式产品入口。中文界面；来源语言与译文边界诚实。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <T003BridgeHost />
      </body>
    </html>
  );
}
