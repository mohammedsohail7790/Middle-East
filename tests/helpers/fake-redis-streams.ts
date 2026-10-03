/**
 * Minimal in-memory Redis Streams + KV fake for deterministic tests of the
 * platform event consumer. NOT real infrastructure: it models only the
 * commands event-consumer.ts / event-idempotency.ts / dead-letter-queue.ts
 * use, with a controllable clock so idle times and key TTLs are testable.
 *
 * Semantics intentionally mirror Redis:
 *   - XREADGROUP '>' delivers only never-delivered entries and puts them in the PEL
 *   - XACK removes from the PEL
 *   - XCLAIM transfers ownership only if idle >= min-idle-time, resets idle,
 *     and increments the delivery counter
 *   - every command body is synchronous, so each command is atomic
 */
interface PelEntry {
  consumer: string;
  deliveredAt: number;
  deliveries: number;
}
interface Group {
  delivered: number;
  pel: Map<string, PelEntry>;
}
interface StreamState {
  entries: { id: string; fields: string[] }[];
  groups: Map<string, Group>;
  seq: number;
}

export class FakeRedisStreams {
  now = 1_000_000;
  private kv = new Map<string, { v: string; exp?: number }>();
  private streams = new Map<string, StreamState>();

  advance(ms: number): void {
    this.now += ms;
  }

  private live(key: string): { v: string; exp?: number } | undefined {
    const row = this.kv.get(key);
    if (row && row.exp !== undefined && row.exp <= this.now) {
      this.kv.delete(key);
      return undefined;
    }
    return row;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.v ?? null;
  }

  async set(key: string, value: string, ...args: (string | number)[]): Promise<'OK' | null> {
    let exp: number | undefined;
    let nx = false;
    for (let i = 0; i < args.length; i++) {
      const a = String(args[i]).toUpperCase();
      if (a === 'EX') exp = this.now + Number(args[++i]) * 1000;
      else if (a === 'NX') nx = true;
    }
    if (nx && this.live(key)) return null;
    this.kv.set(key, { v: value, exp });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.kv.delete(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const n = Number(this.live(key)?.v ?? 0) + 1;
    const prev = this.kv.get(key);
    this.kv.set(key, { v: String(n), exp: prev?.exp });
    return n;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const row = this.live(key);
    if (!row) return 0;
    row.exp = this.now + seconds * 1000;
    return 1;
  }

  private stream(key: string): StreamState {
    let s = this.streams.get(key);
    if (!s) {
      s = { entries: [], groups: new Map(), seq: 0 };
      this.streams.set(key, s);
    }
    return s;
  }

  async xgroup(cmd: string, stream: string, group: string): Promise<'OK'> {
    if (cmd !== 'CREATE') throw new Error(`fake: unsupported XGROUP ${cmd}`);
    const s = this.stream(stream);
    if (s.groups.has(group)) throw new Error('BUSYGROUP Consumer Group name already exists');
    s.groups.set(group, { delivered: 0, pel: new Map() });
    return 'OK';
  }

  async xadd(stream: string, ...args: (string | number)[]): Promise<string> {
    let i = 0;
    if (String(args[0]).toUpperCase() === 'MAXLEN') i = 3;
    i++; // the '*' id
    const s = this.stream(stream);
    const id = `${this.now}-${s.seq++}`;
    s.entries.push({ id, fields: args.slice(i).map(String) });
    return id;
  }

  async xreadgroup(...args: (string | number)[]): Promise<[string, [string, string[]][]][] | null> {
    const group = String(args[1]);
    const consumer = String(args[2]);
    const count = Number(args[args.indexOf('COUNT') + 1]);
    const rest = args.slice(args.indexOf('STREAMS') + 1).map(String);
    const keys = rest.slice(0, rest.length / 2);
    const out: [string, [string, string[]][]][] = [];
    for (const key of keys) {
      const s = this.stream(key);
      const g = s.groups.get(group);
      if (!g) throw new Error(`NOGROUP No such consumer group '${group}' for key name '${key}'`);
      const fresh = s.entries.slice(g.delivered, g.delivered + count);
      if (fresh.length === 0) continue;
      g.delivered += fresh.length;
      for (const e of fresh) g.pel.set(e.id, { consumer, deliveredAt: this.now, deliveries: 1 });
      out.push([key, fresh.map((e) => [e.id, e.fields] as [string, string[]])]);
    }
    return out.length ? out : null;
  }

  async xack(stream: string, group: string, ...ids: string[]): Promise<number> {
    const g = this.stream(stream).groups.get(group);
    let n = 0;
    for (const id of ids) if (g?.pel.delete(id)) n++;
    return n;
  }

  async xpending(stream: string, group: string, _s: string, _e: string, count: number) {
    const g = this.stream(stream).groups.get(group);
    if (!g) return [];
    return [...g.pel.entries()]
      .slice(0, count)
      .map(([id, p]) => [id, p.consumer, this.now - p.deliveredAt, p.deliveries]);
  }

  async xclaim(stream: string, group: string, consumer: string, minIdle: number, ...ids: string[]) {
    const s = this.stream(stream);
    const g = s.groups.get(group);
    const claimed: [string, string[]][] = [];
    for (const id of ids) {
      const p = g?.pel.get(id);
      const entry = s.entries.find((e) => e.id === id);
      if (!p || !entry) continue;
      if (this.now - p.deliveredAt < minIdle) continue;
      p.consumer = consumer;
      p.deliveredAt = this.now;
      p.deliveries++;
      claimed.push([id, entry.fields]);
    }
    return claimed;
  }

  async xrange(stream: string): Promise<[string, string[]][]> {
    return this.stream(stream).entries.map((e) => [e.id, e.fields] as [string, string[]]);
  }

  pendingCount(stream: string, group: string): number {
    return this.stream(stream).groups.get(group)?.pel.size ?? 0;
  }
}
