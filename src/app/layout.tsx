import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RCMS", template: "%s · RCMS" },
  description: "Regional Centre Monitoring System – athlete registry, data quality and kit planning for Khelo India centres.",
  robots: { index: false, follow: false }, // internal government tool containing personal data
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0e2552" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
