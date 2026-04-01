/**
 * Levenshtein distance (Wagner-Fischer algorithm).
 * Returns the minimum number of single-character edits (insertions,
 * deletions, substitutions) required to transform `a` into `b`.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Allocate a (m+1) x (n+1) matrix
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }

  return dp[m][n];
}

/**
 * Find the candidate from `candidates` with the smallest Levenshtein distance
 * to `name`, as long as that distance is ≤ `threshold`.
 *
 * Ties are broken alphabetically (the lexicographically-first candidate wins).
 * Returns `null` if no candidate is within the threshold.
 */
export function findClosest(
  name: string,
  candidates: string[],
  threshold: number = 2,
): string | null {
  let best: string | null = null;
  let bestDist = threshold + 1;

  for (const candidate of candidates) {
    const dist = levenshtein(name, candidate);
    if (dist < bestDist || (dist === bestDist && best !== null && candidate < best)) {
      best = candidate;
      bestDist = dist;
    }
  }

  return bestDist <= threshold ? best : null;
}
