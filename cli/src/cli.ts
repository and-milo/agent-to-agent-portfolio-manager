import { PartnerApiClient } from './client.js';
import { loadConfig, resolve } from './config.js';
import { COMMANDS } from './commands.js';

const DEFAULT_BASE_URL = 'https://partners.andmilo.com';

// ── Arg parser ──────────────────────────────────────────────────

function parseArgs(argv: string[]): { command: string | undefined; flags: Record<string, string | undefined> } {
  const args = argv.slice(2); // skip node + script
  const command = args[0] && !args[0].startsWith('--') ? args[0] : undefined;
  const flags: Record<string, string | undefined> = {};
  const rest = command ? args.slice(1) : args;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    }
  }
  return { command, flags };
}

// ── Usage ───────────────────────────────────────────────────────

function printUsage() {
  const pad = 28;
  console.log(`
  Milo Partner API CLI

  Usage:  milo <command> [flags]

  Global flags:
    --api-key <key>     API key (or MILO_API_KEY env, or ~/.milo/config.json)
    --base-url <url>    API base URL (default: ${DEFAULT_BASE_URL})
    --help              Show this help

  Commands:
${COMMANDS.map((c) => `    ${c.name.padEnd(pad)}${c.description}`).join('\n')}

  Run "milo <command> --help" for command-specific flags.
  Credentials are saved to ~/.milo/config.json after signup.
`);
}

function printCommandHelp(cmd: (typeof COMMANDS)[number]) {
  console.log(`
  milo ${cmd.name}

  ${cmd.description}

  Flags:
${cmd.flags.length === 0 ? '    (none)' : cmd.flags.map((f) => `    --${f.name.padEnd(26)}${f.description}${f.required ? ' (required)' : ''}`).join('\n')}
`);
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  const { command, flags } = parseArgs(process.argv);

  // --help or no command
  if (!command || flags['help'] !== undefined) {
    if (command) {
      const cmd = COMMANDS.find((c) => c.name === command);
      if (cmd) {
        printCommandHelp(cmd);
        return;
      }
    }
    printUsage();
    return;
  }

  // Find command
  const cmd = COMMANDS.find((c) => c.name === command);
  if (!cmd) {
    console.error(`Unknown command: ${command}\nRun "milo --help" to see available commands.`);
    process.exit(1);
  }

  // Per-command --help
  if (flags['help'] !== undefined) {
    printCommandHelp(cmd);
    return;
  }

  // Load config + resolve globals
  const config = loadConfig();
  const baseUrl = resolve(flags['base-url'], 'MILO_BASE_URL', config.base_url) ?? DEFAULT_BASE_URL;
  const apiKey = resolve(flags['api-key'], 'MILO_API_KEY', config.api_key);

  // Remove global flags from the command-specific flags
  delete flags['base-url'];
  delete flags['api-key'];
  delete flags['help'];

  // Instantiate client
  const client = new PartnerApiClient({ baseUrl, apiKey });

  // Dispatch
  try {
    const result = await cmd.handler(flags, client, config);
    if (result !== undefined) {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}

main();
