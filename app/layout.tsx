import type { Metadata } from "next";
import { GeistSans as geistSans } from "geist/font/sans";
import { GeistMono as geistMono } from "geist/font/mono";
import "./globals.css";
import { BookingProvider } from "./context/BookingContext";
import { restrictedFictionalStagingEnabled } from "./lib/deploymentMode";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "Aven Clinic | Acupuncture & Whole-Person Care in San Jose",
  description: "Personal acupuncture, herbal medicine, and whole-person care in San Jose. Explore our services and book your next visit.",
  keywords: "acupuncture, herbal medicine, manual therapy, San Jose, whole-person care",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {restrictedFictionalStagingEnabled() && <div role="status" className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-950">Restricted fictional-data staging - no real patient care, payments, credentials, or approved continuing-education credit.</div>}
        <BookingProvider>{children}</BookingProvider>
      </body>
    </html>
  );
}
