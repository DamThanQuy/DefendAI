import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { AuthGate } from "@/components/auth/AuthGate";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "GraduAI - Mock Defense",
  description: "Hệ thống hỗ trợ bảo vệ đồ án tự động",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans min-h-screen flex flex-col bg-background text-foreground">
        <Navbar />
        <main className="flex-1">
          <AuthGate>{children}</AuthGate>
        </main>
        <Footer />
      </body>
    </html>
  );
}
