import type { Metadata } from "next";
import "./globals.css";
import { HotReloadClient } from "@/app/components/hot-reload-client";

export const metadata: Metadata = {
  title: "Markdown Render",
  description: "Markdown notes renderer with live reload",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased" style={{ backgroundColor: 'var(--mr-bg)', color: 'var(--mr-text)' }}>
        {children}
        <HotReloadClient />
      </body>
    </html>
  );
}
