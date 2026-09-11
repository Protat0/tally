import type { Metadata, Viewport } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import { THEME_COLOR, themeBootScript } from "@/lib/theme";

const publicSans = Public_Sans({ variable: "--font-public-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tally",
  description: "Personal budgeting, simplified.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: THEME_COLOR.dark,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The boot script sets data-theme before React hydrates, so the attribute
    // the server sent and the one React finds can differ — on purpose.
    <html lang="en" className={publicSans.variable} suppressHydrationWarning>
      <head>
        {/* Inline, not next/script: it has to run before the body paints, or a
            light-mode user sees one dark frame on every load. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="bg-canvas text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
