export function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed: string, stream: string): () => number {
  let state = hashString(`${seed}:${stream}`) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function chooseSeeded<T>(items: readonly T[], seed: string, stream: string): T {
  if (items.length === 0) throw new Error("Cannot choose from an empty list");
  const index = Math.floor(createRng(seed, stream)() * items.length);
  return items[index] as T;
}
