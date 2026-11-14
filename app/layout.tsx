import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Handyman on the Go | Your Home. Your Choice. Your Handyman.",
  description: "Find trusted home-service professionals across Gauteng, South Africa."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-ZA"><body>{children}</body></html>;
}