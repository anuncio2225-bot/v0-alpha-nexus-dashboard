import type { Metadata, Viewport } from "next";
import { Syne, Geist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// Syne só no logotipo; a interface inteira usa Geist (ver app/globals.css).
const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AlphaNexus | Dashboard",
  description: "Gestão inteligente de operações para infoprodutores",
  generator: "v0.app",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${syne.variable} ${geist.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "var(--card)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
              },
            }}
          />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
