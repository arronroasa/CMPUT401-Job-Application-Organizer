import { useMemo } from 'react';
import type { ResumeVersion } from '@onfile/core';

type DiffTokenType = 'common' | 'removed' | 'added';
type DiffToken = { type: DiffTokenType; text: string };

type RowType = 'equal' | 'add' | 'remove' | 'replace' | 'context';

type DiffRow = {
  type: RowType;
  left: string;
  right: string;
  leftTokens?: DiffToken[];
  rightTokens?: DiffToken[];
  contextCount?: number;
};

interface DiffViewProps {
  versions: ResumeVersion[];
  versionA: ResumeVersion;
  versionB: ResumeVersion;
  onSelectA: (id: string) => void;
  onSelectB: (id: string) => void;
}

function toDisplayLabel(v: ResumeVersion): string {
  const primary = v.type === 'base' ? 'Base Resume' : (v.company ?? 'Tailored Resume');
  const secondary = v.jobTitle ? ` — ${v.jobTitle}` : '';
  return `${primary}${secondary}`;
}

function normalizeLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function contentLines(version: ResumeVersion): string[] {
  return version.fragments
    .flatMap((frag) => frag.text.split(/\r?\n+/))
    .map(normalizeLine)
    .filter(Boolean);
}

function lcsMatrix(left: string[], right: string[]): number[][] {
  const dp: number[][] = Array.from({ length: left.length + 1 }, () =>
    Array(right.length + 1).fill(0)
  );
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      if (left[i - 1] === right[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

type LineOp =
  | { op: 'equal'; text: string }
  | { op: 'remove'; text: string }
  | { op: 'add'; text: string }
  | { op: 'replace'; left: string; right: string };

function normalizedWords(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9+#/.-]+/g) ?? [];
}

function lineSimilarity(left: string, right: string): number {
  const lw = normalizedWords(left);
  const rw = normalizedWords(right);
  if (lw.length === 0 && rw.length === 0) return 1;
  if (lw.length === 0 || rw.length === 0) return 0;

  const leftSet = new Set(lw);
  const rightSet = new Set(rw);
  let intersect = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) intersect += 1;
  }
  const union = leftSet.size + rightSet.size - intersect;
  const jaccard = union > 0 ? intersect / union : 0;

  const lcs = lcsMatrix(lw, rw)[lw.length][rw.length];
  const overlap = (2 * lcs) / (lw.length + rw.length);

  return (0.65 * jaccard) + (0.35 * overlap);
}

function replaceCost(left: string, right: string): number {
  const similarity = lineSimilarity(left, right);
  if (similarity >= 0.86) return 0.08;
  if (similarity >= 0.68) return 0.28;
  if (similarity >= 0.50) return 0.50;
  if (similarity >= 0.35) return 0.78;
  if (similarity >= 0.22) return 0.96;
  return 2.10;
}

function buildLineDiff(left: string[], right: string[]): LineOp[] {
  const m = left.length;
  const n = right.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  const trace: Array<Array<'equal' | 'replace' | 'remove' | 'add' | null>> = Array.from(
    { length: m + 1 },
    () => Array(n + 1).fill(null)
  );

  for (let i = 1; i <= m; i += 1) {
    dp[i][0] = i;
    trace[i][0] = 'remove';
  }
  for (let j = 1; j <= n; j += 1) {
    dp[0][j] = j;
    trace[0][j] = 'add';
  }

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (left[i - 1] === right[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
        trace[i][j] = 'equal';
        continue;
      }

      const sub = dp[i - 1][j - 1] + replaceCost(left[i - 1], right[j - 1]);
      const del = dp[i - 1][j] + 1;
      const ins = dp[i][j - 1] + 1;

      let best = sub;
      let op: 'replace' | 'remove' | 'add' = 'replace';
      if (del < best) {
        best = del;
        op = 'remove';
      }
      if (ins < best) {
        best = ins;
        op = 'add';
      }

      dp[i][j] = best;
      trace[i][j] = op;
    }
  }

  const ops: LineOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    const op = trace[i][j];
    if (i > 0 && j > 0 && op === 'equal') {
      ops.push({ op: 'equal', text: left[i - 1] });
      i -= 1;
      j -= 1;
      continue;
    }
    if (i > 0 && j > 0 && op === 'replace') {
      ops.push({ op: 'replace', left: left[i - 1], right: right[j - 1] });
      i -= 1;
      j -= 1;
      continue;
    }
    if (i > 0 && (j === 0 || op === 'remove')) {
      ops.push({ op: 'remove', text: left[i - 1] });
      i -= 1;
      continue;
    }
    if (j > 0) {
      ops.push({ op: 'add', text: right[j - 1] });
      j -= 1;
    }
  }

  return ops.reverse();
}

function splitWords(text: string): string[] {
  return text.match(/\S+/g) ?? [];
}

function buildWordDiff(left: string, right: string): { leftTokens: DiffToken[]; rightTokens: DiffToken[] } {
  const lw = splitWords(left);
  const rw = splitWords(right);
  const dp = lcsMatrix(lw, rw);
  const merged: DiffToken[] = [];
  let i = lw.length;
  let j = rw.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && lw[i - 1] === rw[j - 1]) {
      merged.push({ type: 'common', text: lw[i - 1] });
      i -= 1;
      j -= 1;
      continue;
    }
    if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      merged.push({ type: 'added', text: rw[j - 1] });
      j -= 1;
    } else if (i > 0) {
      merged.push({ type: 'removed', text: lw[i - 1] });
      i -= 1;
    }
  }

  const ordered = merged.reverse();
  return {
    leftTokens: ordered.filter((t) => t.type !== 'added'),
    rightTokens: ordered.filter((t) => t.type !== 'removed'),
  };
}

function toRows(left: string[], right: string[]): DiffRow[] {
  const ops = buildLineDiff(left, right);
  const rows: DiffRow[] = [];
  for (const op of ops) {
    if (op.op === 'equal') {
      rows.push({ type: 'equal', left: op.text, right: op.text });
      continue;
    }
    if (op.op === 'replace') {
      const tokenDiff = buildWordDiff(op.left, op.right);
      rows.push({
        type: 'replace',
        left: op.left,
        right: op.right,
        leftTokens: tokenDiff.leftTokens,
        rightTokens: tokenDiff.rightTokens,
      });
      continue;
    }
    if (op.op === 'add') {
      rows.push({ type: 'add', left: '', right: op.text });
    } else {
      rows.push({ type: 'remove', left: op.text, right: '' });
    }
  }
  return rows;
}

function collapseEqualRows(rows: DiffRow[], keepAtEdges = 1, minRunForCollapse = 5): DiffRow[] {
  const collapsed: DiffRow[] = [];
  let idx = 0;

  while (idx < rows.length) {
    if (rows[idx].type !== 'equal') {
      collapsed.push(rows[idx]);
      idx += 1;
      continue;
    }

    let end = idx;
    while (end < rows.length && rows[end].type === 'equal') {
      end += 1;
    }
    const runLength = end - idx;

    if (runLength < minRunForCollapse) {
      collapsed.push(...rows.slice(idx, end));
      idx = end;
      continue;
    }

    collapsed.push(...rows.slice(idx, idx + keepAtEdges));
    const hidden = runLength - (2 * keepAtEdges);
    if (hidden > 0) {
      collapsed.push({
        type: 'context',
        left: '',
        right: '',
        contextCount: hidden,
      });
    }
    collapsed.push(...rows.slice(end - keepAtEdges, end));
    idx = end;
  }

  return collapsed;
}

function TokenLine({ tokens, side }: { tokens: DiffToken[]; side: 'left' | 'right' }) {
  return (
    <span>
      {tokens.map((token, idx) => {
        const cls =
          token.type === 'common'
            ? 'text-zinc-800'
            : token.type === 'removed'
              ? 'bg-red-100 text-red-700 rounded px-0.5'
              : 'bg-emerald-100 text-emerald-700 rounded px-0.5';
        if (side === 'left' && token.type === 'added') return null;
        if (side === 'right' && token.type === 'removed') return null;
        return (
          <span key={`${token.type}-${idx}`} className={cls}>
            {token.text}
            {idx < tokens.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </span>
  );
}

export function DiffView({
  versions,
  versionA,
  versionB,
  onSelectA,
  onSelectB,
}: DiffViewProps) {
  const rows = useMemo(
    () => collapseEqualRows(toRows(contentLines(versionA), contentLines(versionB))),
    [versionA, versionB]
  );

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="rounded-xl border border-border bg-zinc-50 overflow-hidden">
        <div className="grid grid-cols-2 gap-0 border-b border-zinc-300">
          <div className="p-3 border-r border-zinc-300 bg-white">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Compare From</p>
            <select
              value={versionA.id}
              onChange={(e) => onSelectA(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {toDisplayLabel(v)}
                </option>
              ))}
            </select>
          </div>
          <div className="p-3 bg-white">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Compare To</p>
            <select
              value={versionB.id}
              onChange={(e) => onSelectB(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {toDisplayLabel(v)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-zinc-300 bg-zinc-100 text-[11px] text-muted-foreground/70 uppercase tracking-wider font-semibold">
          <div className="px-3 py-2 border-r border-zinc-300">Original</div>
          <div className="px-3 py-2">Compared</div>
        </div>

        <div className="divide-y divide-zinc-200">
          {rows.map((row, idx) => {
            if (row.type === 'context') {
              return (
                <div key={idx} className="px-3 py-2 text-center text-xs font-medium text-muted-foreground bg-zinc-100">
                  {row.contextCount} unchanged lines
                </div>
              );
            }

            const leftBg =
              row.type === 'remove' || row.type === 'replace'
                ? 'bg-red-50'
                : row.type === 'equal'
                  ? 'bg-white'
                  : 'bg-zinc-50';
            const rightBg =
              row.type === 'add' || row.type === 'replace'
                ? 'bg-emerald-50'
                : row.type === 'equal'
                  ? 'bg-white'
                  : 'bg-zinc-50';

            return (
              <div key={idx} className="grid grid-cols-2">
                <div className={`px-3 py-2 border-r border-zinc-200 text-sm leading-6 ${leftBg}`}>
                  {row.left ? (
                    <div className="flex items-start gap-2">
                      {(row.type === 'remove' || row.type === 'replace') && <span className="text-red-600 font-semibold">✕</span>}
                      {row.type === 'replace' && row.leftTokens ? (
                        <TokenLine tokens={row.leftTokens} side="left" />
                      ) : (
                        <span className="text-zinc-800">{row.left}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-foreground/80">&nbsp;</span>
                  )}
                </div>
                <div className={`px-3 py-2 text-sm leading-6 ${rightBg}`}>
                  {row.right ? (
                    <div className="flex items-start gap-2">
                      {(row.type === 'add' || row.type === 'replace') && <span className="text-emerald-600 font-semibold">✓</span>}
                      {row.type === 'replace' && row.rightTokens ? (
                        <TokenLine tokens={row.rightTokens} side="right" />
                      ) : (
                        <span className="text-zinc-800">{row.right}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-foreground/80">&nbsp;</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
