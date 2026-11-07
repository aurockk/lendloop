import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Archivo, Big_Shoulders_Stencil } from "next/font/google";
import { Header } from "./_components/header";
import { Providers } from "./_components/providers";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
const stencil = Big_Shoulders_Stencil({ variable: "--font-stencil-face", subsets: ["latin"], weight: ["700", "900"] });

export const metadata: Metadata = {
  title: "LendLoop",
  description: "Borrow what you need. Lend what you don't.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${stencil.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ClerkProvider>
          <Providers>
            <Header />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-8">{children}</main>
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
