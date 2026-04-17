import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BookingProvider } from "./context/BookingContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "中医诊所 - 专业中医治疗服务 | San Jose",
  description: "欢迎来到我们的中医诊所，提供针灸、中药、推拿等专业中医治疗服务。位于San Jose，预约挂号方便。",
  keywords: "中医, 针灸, 中药, 推拿, 传统中医, San Jose, 健康治疗",
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
