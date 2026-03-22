import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Municipal Data Infrastructure",
  description: "Fast prototype for a municipal data access layer and visualization frontend.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
