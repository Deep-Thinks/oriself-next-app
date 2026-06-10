/**
 * 本地信件历史 · 只存在浏览器 localStorage，后端不感知。
 *
 * 用户在首页看到"之前写过的信 / 拿到的报告"，点进去能回看或再看报告。
 * 换一台设备 / 清缓存 → 历史消失。这是有意为之：我们不想在服务端做账号。
 */

const STORAGE_KEY = "oriself:letters:v1";
const MAX_ENTRIES = 50;

export interface LocalLetterEntry {
  letterId: string;
  createdAt: number;  // ms
  updatedAt: number;  // ms · 列表排序依据
  roundCount: number;
  status: "active" | "completed";
  /** 报告相关（完成后填） */
  issueSlug?: string;
  mbtiType?: string;
  cardTitle?: string;
  /** v2.7 · 域（mbti | major）与 major 方向标签 */
  domain?: string;
  resultLabel?: string;
  /** §5 · publish 凭证（converge 时下发，仅本人浏览器持有）；用于「公开到画廊」鉴权。 */
  ownerToken?: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeRead(): LocalLetterEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (e): e is LocalLetterEntry =>
        e && typeof e.letterId === "string" && typeof e.updatedAt === "number",
    );
  } catch {
    return [];
  }
}

/**
 * 容量淘汰 · D-A 后 localStorage 是 ownerToken+letterId 的唯一事实源，
 * 误删一条 = 永久销毁那封信的 publish 权 + 回看（连认领链接都无法再生）。
 * 因此淘汰必须保护带 ownerToken 的条目：只淘汰无 token 条目（最旧优先）；
 * 仅当带 token 的条目自身就超过 MAX_ENTRIES 时，才不得已淘汰最旧的 token 条目（并 warn）。
 */
function evict(list: LocalLetterEntry[]): LocalLetterEntry[] {
  if (list.length <= MAX_ENTRIES) return list;
  const byRecent = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  const withToken = byRecent.filter((e) => !!e.ownerToken);
  const noToken = byRecent.filter((e) => !e.ownerToken);

  if (withToken.length >= MAX_ENTRIES) {
    if (withToken.length > MAX_ENTRIES) {
      console.warn(
        `[oriself history] owner-token 条目(${withToken.length}) 已超过上限(${MAX_ENTRIES})，` +
          `不得已淘汰最旧的 owner 条目；其 publish 权将丢失。`,
      );
    }
    return withToken.slice(0, MAX_ENTRIES);
  }
  // token 条目全保留，剩余名额给最近的无 token 条目。
  const room = MAX_ENTRIES - withToken.length;
  return [...withToken, ...noToken.slice(0, room)];
}

function safeWrite(list: LocalLetterEntry[]): void {
  if (!isBrowser()) return;
  try {
    const trimmed = evict(list);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota / private mode — silent */
  }
}

/** 读全部条目，按 updatedAt 降序。 */
export function getAllLetters(): LocalLetterEntry[] {
  return [...safeRead()].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 按 issueSlug 反查本地条目 · owner 判定的唯一事实源（D-A：letter_id 不再走公开 API）。 */
export function findByIssueSlug(slug: string): LocalLetterEntry | null {
  return getAllLetters().find((e) => e.issueSlug === slug) ?? null;
}

/** 信匣导出 · 人可读清单 + 末尾 JSON（含 ownerToken，用于换设备后手动找回 publish 权）。 */
export function exportLetters(): string {
  const entries = getAllLetters();
  const lines = entries.map((e) => {
    const d = new Date(e.createdAt).toISOString().slice(0, 10);
    const url = e.issueSlug
      ? `https://next.oriself.com/issues/${e.issueSlug}`
      : `(未完成 · ${e.letterId.slice(0, 8)})`;
    return `${d} · ${e.cardTitle ?? e.mbtiType ?? "一封信"} · ${url}`;
  });
  return `OriSelf 信匣 · ${entries.length} 封\n\n${lines.join("\n")}\n\n--- 凭证（换设备恢复用，请妥善保存） ---\n${JSON.stringify(entries, null, 2)}`;
}

/**
 * Upsert 一条记录。
 * - 新记录：补齐默认字段；createdAt 默认当前时间戳。
 * - 已存在：patch 字段覆盖；createdAt 永不重写；updatedAt 自动刷新。
 * - 传入 `undefined` 的字段不会覆盖已存在的值（保护历史元数据）。
 */
export function upsertLetter(
  patch: Partial<LocalLetterEntry> & { letterId: string },
): LocalLetterEntry | null {
  if (!isBrowser()) return null;
  const list = safeRead();
  const now = Date.now();
  const idx = list.findIndex((e) => e.letterId === patch.letterId);

  let merged: LocalLetterEntry;
  if (idx >= 0) {
    const prev = list[idx];
    merged = {
      ...prev,
      // 只合并 patch 中非 undefined 的字段
      ...Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined),
      ),
      letterId: prev.letterId,      // 保险
      createdAt: prev.createdAt,    // 不可变
      updatedAt: now,
    } as LocalLetterEntry;
    list[idx] = merged;
  } else {
    merged = {
      letterId: patch.letterId,
      createdAt: patch.createdAt ?? now,
      updatedAt: now,
      roundCount: patch.roundCount ?? 0,
      status: patch.status ?? "active",
      issueSlug: patch.issueSlug,
      mbtiType: patch.mbtiType,
      cardTitle: patch.cardTitle,
      domain: patch.domain,
      resultLabel: patch.resultLabel,
      ownerToken: patch.ownerToken,
    };
    list.unshift(merged);
  }
  safeWrite(list);
  return merged;
}

export function removeLetter(letterId: string): void {
  safeWrite(safeRead().filter((e) => e.letterId !== letterId));
}

export function clearLetters(): void {
  safeWrite([]);
}

// ───── 认领凭证（跨浏览器 owner 权移交，微信场景） ─────

const CLAIMS_KEY = "oriself:claims:v1";   // { [slug]: ownerToken } · 认领的 publish 凭证

/**
 * 读 claims map · 任何非「纯对象」的脏值（array / number / null / 解析失败）一律归零成 {}，
 * 避免后续 `map[slug]=token` 把脏结构写回去越腌越坏（凭证存储是 publish 权的事实源，要硬）。
 */
function readClaimMap(): Record<string, string> {
  if (!isBrowser()) return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CLAIMS_KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function writeClaimMap(map: Record<string, string>): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(CLAIMS_KEY, JSON.stringify(map));
  } catch { /* quota / private mode — silent */ }
}

export function getClaim(slug: string): string | null {
  const v = readClaimMap()[slug];
  return typeof v === "string" ? v : null;
}

export function setClaim(slug: string, token: string): void {
  if (!isBrowser()) return;
  const map = readClaimMap();
  map[slug] = token;
  writeClaimMap(map);
}

export function clearClaim(slug: string): void {
  if (!isBrowser()) return;
  const map = readClaimMap();
  delete map[slug];
  writeClaimMap(map);
}

/**
 * 幂等消费 URL fragment 里的认领凭证（#claim=<token>）：解析→落 store→抹 fragment。
 * 正则不锚定结尾：微信页内转发可能往 URL 尾部拼 from=singlemessage 等参数。
 */
export function consumeClaimFromHash(slug: string): void {
  if (!isBrowser()) return;
  const m = window.location.hash.match(/#claim=([0-9a-f]{32})/);
  if (!m) return;
  setClaim(slug, m[1]);
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

/** owner 凭证统一入口：先幂等消费 fragment，再查「本浏览器写出(ownerToken)或认领(claim)」。 */
export function getOwnerToken(slug: string): string | null {
  consumeClaimFromHash(slug);
  return findByIssueSlug(slug)?.ownerToken ?? getClaim(slug);
}

/**
 * owner 视角判定（受众分流 / is_owner 埋点的唯一事实源）：先幂等消费 #claim=，
 * 再判「本浏览器有此信的本地条目 或 持有认领凭证」。
 *
 * 注意与 getOwnerToken 的差别：getOwnerToken 要 `ownerToken`（publish 凭证），
 * 这里只要「有本地条目或 claim」——legacy 无 token 条目的主人也算 owner（看 owner 视角 CTA、
 * 不被当接收者），但没有 publish 开关（无凭证）。两者刻意分离，不要合并。
 */
export function isOwnerOf(slug: string): boolean {
  consumeClaimFromHash(slug);
  return !!findByIssueSlug(slug) || getClaim(slug) !== null;
}
