import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegister } from "@mingxi/ui/components/mindtrace/ServiceWorkerRegister";
import { ProductDemoTour } from "@mingxi/ui/components/mingxi/ProductDemoTour";
import "@mingxi/ui/styles/globals.css";
import { DemoDataSourceProvider } from "../src/demo-data-source";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "MindTrace · 小布行动记",
    template: "%s · MindTrace",
  },
  description:
    "把看见的启发变成可追溯、可行动、会被结果修正的个人记忆。",
  applicationName: "MindTrace",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MindTrace",
  },
  icons: {
    icon: "/mindtrace-icon.svg",
    shortcut: "/mindtrace-icon.svg",
    apple: "/mindtrace-icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f6f3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable}`}
      >
        <DemoDataSourceProvider>
          {children}
          <ProductDemoTour />
          <ServiceWorkerRegister />
        </DemoDataSourceProvider>
      </body>
    </html>
  );
}
