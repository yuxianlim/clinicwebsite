import type { FullConfig } from '@playwright/test';
import { rmSync } from 'node:fs';
import path from 'node:path';

export default function cleanup(config: FullConfig) {
  const directory = config.metadata.responsiveDataDirectory as string;
  const expectedRoot = path.join(process.cwd(), '.data', 'responsive-tests');
  if (path.dirname(directory) !== expectedRoot || !/^\d+-\d+$/.test(path.basename(directory))) throw new Error('Unexpected responsive fixture directory.');
  rmSync(directory, { recursive: true, force: true });
}
