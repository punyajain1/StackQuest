import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StackQuest - Every developer has a tab open",
  description: "Test your Stack Overflow knowledge in a fast-paced quiz environment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col pt-12">{children}</body>
    </html>
  );
}
