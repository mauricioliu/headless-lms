import type { ReactNode } from "react";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { getBranding } from "@/lib/api/branding";

// Self-hosted Pretendard variable font — shared with the student app so the
// product family reads as one. No FOUT, no layout shift, offline-safe.
const pretendard = localFont({
  src: "../fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

// The brand is runtime config, so no route is honestly static. Pages with more
// specific metadata (login, invite, the dashboard's org title) override this.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await getBranding();
  return {
    title: brandName,
    description: "Panel de administración de cursos.",
  };
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className={pretendard.variable}>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
