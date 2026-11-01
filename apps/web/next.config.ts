import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["pg", "nodemailer"],
  allowedDevOrigins: ["*.e2b.app"],
};
export default config;
