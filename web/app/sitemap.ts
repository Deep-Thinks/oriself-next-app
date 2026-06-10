import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { listPublicIssues } from "@/lib/api";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const issues = await listPublicIssues();
  return [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    {
      url: `${SITE_URL}/issues`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    ...issues.map((i) => ({
      // 注：TestResult 无 updated_at；用 issue_generated_at（后端字段名 generated_at）。
      url: `${SITE_URL}/issues/${i.slug}`,
      lastModified: new Date(i.generated_at),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
