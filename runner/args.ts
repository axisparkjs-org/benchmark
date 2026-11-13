/** Minimal parser of `--name value`, `--name=value` and boolean `--flag` arguments. */
export function parseArgs(argv: string[], booleans: string[] = []): { options: Record<string, string | boolean>; positionals: string[] } {
    const options: Record<string, string | boolean> = {};
    const positionals: string[] = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith('--')) {
            positionals.push(arg);
            continue;
        }
        const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
        if (inline !== undefined) options[name] = inline;
        else if (booleans.includes(name)) options[name] = true;
        else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) options[name] = argv[++i];
        else options[name] = true;
    }
    return { options, positionals };
}

export function list(value: string | boolean | undefined): string[] | undefined {
    if (typeof value !== 'string') return undefined;
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}
