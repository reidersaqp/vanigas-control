import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VANIGAS | Control comercial",
  description: "Sistema de inventario, ventas, recargas y caja de VANIGAS.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
