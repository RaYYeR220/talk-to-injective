import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Talk to Injective",
  description: "Ask about Injective in plain English — live on-chain data, no trading.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
