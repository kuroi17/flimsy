import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface FlimsySelectionTarget {
  file: string;
  line: number;
  col: number;
  tagName?: string;
  componentName?: string;
  classes?: string;
  text?: string;
}

export interface FlimsySelectionSnapshot {
  rootDir: string;
  primary: FlimsySelectionTarget;
  targets: FlimsySelectionTarget[];
  updatedAt: number;
}

/**
 * Returns a deterministic temp file path keyed by project root directory so
 * live browser selection state never litters the user's git working tree.
 */
export function getSelectionStatePath(rootDir: string): string {
  const normalized = path.resolve(rootDir).replace(/\\/g, '/').toLowerCase();
  const hash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), `flimsy-selection-${hash}.json`);
}

export async function writeSelectionState(
  rootDir: string,
  snapshot: Omit<FlimsySelectionSnapshot, 'rootDir' | 'updatedAt'>
): Promise<void> {
  const filePath = getSelectionStatePath(rootDir);
  const payload: FlimsySelectionSnapshot = {
    rootDir: path.resolve(rootDir),
    primary: snapshot.primary,
    targets: snapshot.targets,
    updatedAt: Date.now(),
  };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

export async function readSelectionState(
  rootDir: string
): Promise<FlimsySelectionSnapshot | null> {
  try {
    const filePath = getSelectionStatePath(rootDir);
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.primary || !parsed.primary.file) return null;
    return parsed as FlimsySelectionSnapshot;
  } catch {
    return null;
  }
}
