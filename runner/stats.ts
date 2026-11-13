export function median(values: readonly number[]): number {
    if (values.length === 0) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Rounds to 3 significant decimals, enough for nanoseconds and percentages without noise in the files. */
export function round(value: number, decimals = 3): number {
    if (!Number.isFinite(value)) return value;
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

export function percentChange(previous: number, current: number): number {
    return ((current - previous) / previous) * 100;
}
