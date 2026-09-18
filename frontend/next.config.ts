import type { NextConfig } from "next";

const isPagesBuild = process.env.INFRARENDER_PAGES === "true";
const backendUrl = process.env.NEXT_PUBLIC_INFRARENDER_API_URL?.trim();

if (isPagesBuild) {
  if (!backendUrl) {
    throw new Error(
      "Pages builds require NEXT_PUBLIC_INFRARENDER_API_URL pointing to the deployed HTTPS backend.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(backendUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_INFRARENDER_API_URL must be an absolute HTTPS URL.");
  }
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash ||
    ["localhost", "127.0.0.1", "[::1]"].includes(parsedUrl.hostname)
  ) {
    throw new Error(
      "Pages builds require a public HTTPS backend URL without credentials, query parameters, or fragments.",
    );
  }
}

const nextConfig: NextConfig = {
  output: "export",
  basePath: isPagesBuild ? "/InfraRender" : "",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
