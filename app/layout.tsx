import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VANIGAS | Control comercial",
  description: "Sistema de inventario, ventas, recargas y caja de VANIGAS.",
  icons: {
    icon: "/logo_vanigas.png",
    shortcut: "/logo_vanigas.png",
    apple: "/logo_vanigas.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
