import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { listPublicIssues } from "@/lib/api";

// ISR：每 1h 重新生成 sitemap，让新公开的命题在 1h 内进入收录，无需等下次部署。
export const revalidate = 3600;

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
