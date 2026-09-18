import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InfraRender AI",
  description:
    "Biên soạn prompt và render phối cảnh hạ tầng từ ảnh tham chiếu với bối cảnh do bạn lựa chọn.",
  icons: { icon: `${process.env.INFRARENDER_PAGES === "true" ? "/InfraRender" : ""}/icon.svg` },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" translate="no">
      <body>{children}</body>
    </html>
  );
}
