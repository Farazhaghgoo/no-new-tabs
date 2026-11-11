// Rebuild the generated face icons and animation cells from saved source sheets.
// Windows uses the built-in System.Drawing library; no npm dependencies.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if (process.platform !== 'win32') {
  console.error('The exported PNGs are already included. Re-export on Windows with tools/export-brand.ps1.');
  process.exit(1);
}
const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./export-brand.ps1', import.meta.url))], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
