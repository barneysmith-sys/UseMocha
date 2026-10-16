import type { MetadataRoute } from "next";

const site = "https://usemocha.app";

const paths = ["/", "/setup", "/interview", "/app", "/signin.html", "/pro.html", "/universities.html", "/legal.html", "/dashboard.html"];

export default function sitemap(): MetadataRoute.Sitemap {
  return paths.map((path) => ({
    url: path === "/" ? `${site}/` : `${site}${path}`,
  }));
}
