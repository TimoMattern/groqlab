/**
 * Headless CLI — drive GroqLab from the command line.
 *
 * Usage:
 *   npx tsx scripts/headless.ts <command> [options]
 *
 * Requires a running app server (default: http://localhost:3000).
 * Use --url to point to a different instance.
 *
 * Connection defaults are resolved from (lowest priority first):
 *   1. groqlab.json / .groqlabrc in cwd or nearest ancestor
 *   2. Environment variables: GROQLAB_PROJECT, GROQLAB_DATASET, GROQLAB_TOKEN, GROQLAB_URL
 *   3. CLI flags --project, --dataset, --token, --url
 */

import { HeadlessDriver } from "../src/lib/headless-driver";
import { loadConfig, requireConnection } from "../src/lib/headless-config";

function parseArgs(argv: string[]): { command: string; args: string[]; flags: Record<string, string> } {
  const args: string[] = [];
  const flags: Record<string, string> = {};
  let command = "";

  let i = 2;
  if (i < argv.length) command = argv[i++];

  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        flags[key] = argv[++i];
      } else {
        flags[key] = "true";
      }
    } else {
      args.push(arg);
    }
    i++;
  }

  return { command, args, flags };
}

async function main() {
  const { command, args, flags } = parseArgs(process.argv);
  const config = loadConfig(flags);
  const baseUrl = config.url || "http://localhost:3000";
  const driver = new HeadlessDriver({ baseUrl });

  if (!command || command === "help") {
    console.log(`
Usage: npx tsx scripts/headless.ts <command> [options]

Commands:
  query <groq>                   Execute a GROQ query
    [--project <id> --dataset <name>]  [--token <key>]
    [--params <json>]

  schema                         Fetch schema for a connection
    [--project <id> --dataset <name>]  [--token <key>]

  connection test                Test a connection
    [--project <id> --dataset <name>]

  autocomplete <before-text>     Get completions for text before cursor
    [--project <id> --dataset <name>]   (optional, improves completions with schema)

  recording <start|stop|export|clear|status>   Manage server-side recording
    [--intervalMs <ms>]                     (for start)

  snapshot                       Get current store snapshot
    (browser-only — use window.__FLIGHT__)

  export [path]                  Export recording to file (default: flight-record-<timestamp>.json)

  batch <file>                   Run commands from a JSON file

Options:
  --json                         Raw JSON output
  --url <url>                    App URL (default: http://localhost:3000)

Connection defaults:
  groqlab.json > env vars (GROQLAB_*) > CLI flags
`);
    process.exit(0);
  }

  const jsonOutput = flags.json === "true" || flags.json === "";

  async function output(data: unknown) {
    if (jsonOutput) {
      console.log(JSON.stringify(data));
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  try {
    switch (command) {
      case "query": {
        const groq = args.join(" ");
        if (!groq) {
          console.error("Error: query text is required");
          process.exit(1);
        }
        const connection = requireConnection(config);
        let params: Record<string, unknown> | undefined;
        if (flags.params) {
          try { params = JSON.parse(flags.params); } catch { console.error("Error: --params must be valid JSON"); process.exit(1); }
        }
        const result = await driver.query(groq, connection, params);
        output(result);
        break;
      }

      case "schema": {
        const connection = requireConnection(config);
        const types = await driver.fetchSchema(connection);
        output(types);
        break;
      }

      case "connection": {
        const sub = args[0];
        if (sub === "test") {
          const connection = requireConnection(config);
          const result = await driver.testConnection(connection.projectId, connection.dataset);
          output(result);
        } else {
          console.error("Error: unknown connection subcommand. Use: test");
          process.exit(1);
        }
        break;
      }

      case "recording": {
        const sub = args[0];
        if (!sub) {
          console.error("Error: recording requires a subcommand: start, stop, export, clear, status");
          process.exit(1);
        }
        const subArgs: Record<string, unknown> = {};
        if (sub === "start" && flags.intervalMs) subArgs.intervalMs = parseInt(flags.intervalMs, 10);
        const response = await driver.executeCommand(`recording.${sub}`, subArgs);
        output(response.data);
        break;
      }

      case "snapshot": {
        const response = await driver.executeCommand("store.snapshot", {});
        output(response.data);
        break;
      }

      case "export": {
        const filePath = args[0];
        const response = await driver.executeCommand("recording.export", {});
        const fs = await import("fs");
        const outputPath = filePath || `flight-record-${Date.now()}.json`;
        fs.writeFileSync(outputPath, JSON.stringify(response.data, null, 2), "utf-8");
        console.log(`Recording exported to ${outputPath}`);
        break;
      }

      case "autocomplete": {
        const before = args.join(" ");
        if (!before) {
          console.error("Error: autocomplete requires text before cursor as argument");
          process.exit(1);
        }
        let types: Awaited<ReturnType<typeof driver.fetchSchema>> | undefined;
        if (config.projectId && config.dataset) {
          const connection = requireConnection(config);
          types = await driver.fetchSchema(connection);
        }
        const result = await driver.autocomplete(before, types);
        output(result);
        break;
      }

      case "batch": {
        const filePath = args[0];
        if (!filePath) {
          console.error("Error: batch file path is required");
          process.exit(1);
        }
        const fs = await import("fs");
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const batch = JSON.parse(fileContent) as { commands: Array<{ command: string; args: Record<string, unknown> }> };
        const results: Array<{ command: string; response: unknown }> = [];
        for (const cmd of batch.commands) {
          try {
            const response = await driver.executeCommand(cmd.command, cmd.args);
            results.push({ command: cmd.command, response });
          } catch (err) {
            results.push({ command: cmd.command, response: { error: err instanceof Error ? err.message : String(err) } });
            break;
          }
        }
        output(results);
        break;
      }

      default: {
        console.error(`Unknown command: ${command}`);
        process.exit(1);
      }
    }
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
