import type { Vfs } from './vfs';

/**
 * Files written to a brand-new disk. Apps add their own sample files here as they land.
 * Seeding runs once per disk (tracked in the kv store).
 */
export interface SeedFile {
  path: string;
  content: string | Uint8Array;
  /** seed version that introduced this file (1 = first release) */
  since?: number;
}

/** Bump when new sample files/shortcuts ship, so existing disks get them too. */
export const SEED_VERSION = 8;

/** Files renamed by later versions (applied once when upgrading past `since`). */
export const SEED_RENAMES: { since: number; from: string; to: string }[] = [
  { since: 4, from: '/Desktop/Browser.LNK', to: 'Internet Navigator.LNK' },
  { since: 6, from: '/Desktop/BASIC.LNK', to: 'BASIC Editor.LNK' },
];

const README = `Welcome to Orbit Personal System!

Orbit is a little desktop that lives in your web browser. Everything you make is saved on "Orbit HD", a disk stored inside this browser.

GETTING AROUND
  * Double-click an icon to open it.
  * Drag windows by their title bar; resize from any edge.
  * The boxes on the right of a title bar minimize, maximize and close.
  * Right-click the desktop or an icon for more options.
  * The Launch button (bottom left, or F9) opens every application.

KEYBOARD
  * Ctrl+F4 closes a window, Ctrl+\` switches windows.
  * F10 opens the menus, Tab moves between controls.

Your files never leave this computer unless you export them. Use Config > Disk to back up the whole disk as a .zip file.

Have fun!
`;

export const SEED_FILES: SeedFile[] = [
  { path: '/Documents/README.TXT', content: README },
  { path: '/Desktop/README.LNK', content: JSON.stringify({ path: '/Documents/README.TXT' }) },
];

/** Shortcuts on the desktop for each installed app (registered by apps). */
export const SEED_DIRS = ['/Desktop', '/Documents', '/Pictures', '/Programs', '/Music', '/Data', '/Screensavers', '/Trash'];

export async function seedDisk(fs: Vfs, extra: SeedFile[] = []): Promise<boolean> {
  const seeded = await fs.getKV<boolean>('seeded');
  const have = seeded ? (await fs.getKV<number>('seedVersion')) ?? 1 : 0;
  if (have >= SEED_VERSION) return false;
  for (const d of SEED_DIRS) if (!fs.exists(d)) await fs.mkdir(d);
  for (const r of SEED_RENAMES) {
    const dir = r.from.slice(0, r.from.lastIndexOf('/'));
    if (r.since > have && have > 0 && fs.exists(r.from) && !fs.exists(dir + '/' + r.to)) {
      try { await fs.rename(r.from, r.to); } catch { /* keep the old name */ }
    }
  }
  for (const f of [...SEED_FILES, ...extra]) {
    // only add files introduced after this disk was last seeded; never overwrite
    if ((f.since ?? 1) > have && !fs.exists(f.path)) await fs.write(f.path, f.content);
  }
  await fs.setKV('seeded', true);
  await fs.setKV('seedVersion', SEED_VERSION);
  return true;
}
