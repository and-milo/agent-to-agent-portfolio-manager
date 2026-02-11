import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface MiloConfig {
  api_key?: string;
  user_id?: string;
  wallet_id?: string;
  wallet_address?: string;
  base_url?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.milo');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export function loadConfig(): MiloConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as MiloConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: MiloConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Resolve a parameter with precedence: flag > env > config.
 */
export function resolve(
  flagValue: string | undefined,
  envVar: string | undefined,
  configValue: string | undefined,
): string | undefined {
  if (flagValue !== undefined) return flagValue;
  if (envVar !== undefined) {
    const val = process.env[envVar];
    if (val !== undefined && val !== '') return val;
  }
  return configValue;
}
