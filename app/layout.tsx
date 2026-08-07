import type { Metadata, Viewport } from "next";
import "./globals.css";
import { HotReloadClient } from "@/app/components/hot-reload-client";

export const metadata: Metadata = {
  title: "Markdown Render",
  description: "Markdown notes renderer with live reload",
  icons: {
    icon: [
      { url: "/favicon/favicon.ico" },
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/favicon/apple-touch-icon.png" },
    ],
  },
  manifest: "/favicon/site.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#181825",
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
