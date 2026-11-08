import type { Metadata } from "next";
import { GeistSans as geistSans } from "geist/font/sans";
import { GeistMono as geistMono } from "geist/font/mono";
import "./globals.css";
import { BookingProvider } from "./context/BookingContext";

export const metadata: Metadata = {
  title: "Aven Clinic | Acupuncture & Whole-Person Care in San Jose",
  description: "Personal acupuncture, herbal medicine, and whole-person care in San Jose. Explore our services and book your next visit.",
  keywords: "acupuncture, herbal medicine, manual therapy, San Jose, whole-person care",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BookingProvider>{children}</BookingProvider>
      </body>
    </html>
  );
}
