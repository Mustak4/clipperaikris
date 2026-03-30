import type { LibraryClipEntry } from "@/types/jobs";

const KEY = "clipper_library_v1";

export function getLibraryEntries(): LibraryClipEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LibraryClipEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function upsertLibraryEntries(entries: LibraryClipEntry[]) {
  const existing = getLibraryEntries();
  const map = new Map(existing.map((e) => [`${e.jobId}:${e.id}`, e]));
  for (const entry of entries) {
    map.set(`${entry.jobId}:${entry.id}`, entry);
  }
  const next = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
  localStorage.setItem(KEY, JSON.stringify(next));
}

