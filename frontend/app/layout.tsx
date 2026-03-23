import "./globals.css";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import AppHeader from "../components/AppHeader";
import AppSidebar from "../components/AppSidebar";

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700", "800"],
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Municipal Data Infrastructure",
  description: "Municipal operations console for cross-department data access and analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${monoFont.variable}`}>
        <div className="appShell">
          <Suspense fallback={null}>
            <AppHeader />
          </Suspense>
          <div className="appShellBody">
            <Suspense fallback={null}>
              <AppSidebar />
            </Suspense>
            <div className="appContent">{children}</div>
          </div>
        </div>
      </body>
    </html>
  );
}
