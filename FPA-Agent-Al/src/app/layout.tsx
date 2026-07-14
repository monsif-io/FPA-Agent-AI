import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FPA Collections Agent | FinancePro Advisory",
  description: "Système intelligent de recouvrement de créances - FinancePro Advisory",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <link rel="icon" href="/logo.png" />
        <script src="https://unpkg.com/@phosphor-icons/web@2.1.1" async></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
