import type { Metadata } from "next";
import "./portal.css";
import { headers } from "next/headers";
export const metadata: Metadata = {
  title: "RequestLab Cloud",
  description: "Optional cloud workspaces for your local-first API client",
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await headers();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
