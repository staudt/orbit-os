/** Importing this module registers every bundled application. */
import './about';
import './config';
import './files';
import './write';
import './basic';
import './draw';
import './calc';
import './browser';
import './music';
import './clock';
import './terminal';
import './launcher';
import type { SeedFile } from '../fs/seed';
import { M2_SEEDS } from '../seed/m2';
import { m3Seeds } from '../seed/m3';

/** Sample files contributed by apps for a brand-new disk. */
export function appSeedFiles(): SeedFile[] {
  return [...M2_SEEDS, ...m3Seeds()];
}
