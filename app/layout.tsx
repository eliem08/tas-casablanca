import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "TAS Casablanca — Truck Appointment System for the Port of Casablanca",
  description:
    "Interactive demo of a truck appointment system that unclogs the Port of Casablanca: slot optimization, no-show-aware overbooking, and live congestion analytics.",
  keywords: [
    "port of casablanca",
    "truck appointment system",
    "port logistics",
    "gate optimization",
    "Morocco",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable}`}
    >
      <body className="font-sans">
        <Nav />
        <main className="min-h-[70vh]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
