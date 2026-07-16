import type { Metadata } from "next";
import { Inter, JetBrains_Mono, EB_Garamond } from "next/font/google";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { AuthGate } from "@/components/auth/AuthGate";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
const garamond = EB_Garamond({ subsets: ["latin"], variable: "--font-serif", weight: ["400", "500", "600", "700", "800"] });

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
    <html lang="vi" className={`${inter.variable} ${jetbrainsMono.variable} ${garamond.variable}`} suppressHydrationWarning>
      <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""}>
        <body className="font-sans min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300">
          <ThemeProvider defaultTheme="dark" storageKey="defendai-theme">
            <Navbar />
            <main className="flex-1">
              <AuthGate>{children}</AuthGate>
            </main>
            <Footer />
          </ThemeProvider>
        </body>
      </GoogleOAuthProvider>
    </html>
  );
}
