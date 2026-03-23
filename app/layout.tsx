import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/providers/auth-provider";

export const metadata: Metadata = {
  title: "Milau",
  description: "Milau helps friends and groups split expenses, track balances, and settle up with less friction."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-mist text-ink antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
