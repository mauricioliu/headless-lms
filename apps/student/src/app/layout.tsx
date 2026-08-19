import type { ReactNode } from "react";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import { Toast } from "@/components/primitives/toast";
import { getBranding } from "@/lib/api/branding";

// Self-hosted Pretendard variable font (best practice: no FOUT, no layout shift).
const pretendard = localFont({
  src: "../fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

// The portal is session-personalized and its brand is runtime config — no
// route here is honestly static.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await getBranding();
  const title = `${brandName} — Tus cursos`;
  const description = "Tus cursos, tu avance y tu evaluación, todo en un lugar.";
  return {
    title,
    description,
    openGraph: { title, description, locale: "es_CL", type: "website" },
  };
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // suppressHydrationWarning: next-themes sets the theme class on <html>
    // before hydration.
    <html lang="es" className={pretendard.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppProvider>
            {children}
            <Toast />
          </AppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
