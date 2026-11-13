/** Minimal semver ordering for the released versions (`1.5.1`, `1.6.0-pre.0`). */
export function parse(version: string): [number, number, number, string] {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
    if (!match) throw new Error(`Invalid version '${version}'`);
    return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? ''];
}

export function compare(a: string, b: string): number {
    const [pa, pb] = [parse(a), parse(b)];
    for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] as number) - (pb[i] as number);
    if (pa[3] === pb[3]) return 0;
    if (!pa[3]) return 1;
    if (!pb[3]) return -1;
    return pa[3] < pb[3] ? -1 : 1;
}

export function isValid(version: string): boolean {
    return /^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version);
}

export function minorOf(version: string): string {
    const [major, minor] = parse(version);
    return `${major}.${minor}`;
}
