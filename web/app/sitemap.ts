import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { listPublicIssues } from "@/lib/api";
import { TYPE_ORDER } from "@/lib/type-profiles";

// ISR：每 1h 重新生成 sitemap，让新公开的命题在 1h 内进入收录，无需等下次部署。
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const issues = await listPublicIssues();
  return [
    // 静态页不写 lastModified：本文件每小时再生成，new Date() 是假时间戳，
    // 搜索引擎会学会不信任它；缺省合法。issue 详情有真实 generated_at，保留。
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/types`, changeFrequency: "monthly", priority: 0.8 },
    ...TYPE_ORDER.map((id) => ({
      url: `${SITE_URL}/types/${id}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: `${SITE_URL}/issues`, changeFrequency: "daily", priority: 0.8 },
    ...issues.map((i) => ({
      // 注：TestResult 无 updated_at；用 issue_generated_at（后端字段名 generated_at）。
      url: `${SITE_URL}/issues/${i.slug}`,
      lastModified: new Date(i.generated_at),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
