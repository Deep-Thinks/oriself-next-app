// web/lib/share.ts
/**
 * 分享文本 · 微信对话粘贴出来的样子就是「分享卡」。
 * 克制：三行——『标题』/ 一句信件口吻的副标题 / 链接，无 emoji、无动员文案。
 */
export function buildShareText(title: string, url: string): string {
  return `『${title}』\n一封写给我的信 · OriSelf\n${url}`;
}
