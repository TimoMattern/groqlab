import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";

export interface GroqlabConfig {
  projectId?: string;
  dataset?: string;
  token?: string;
  url?: string;
}

const CONFIG_FILES = ["groqlab.json", ".groqlabrc"];

function findConfig(startDir: string): { path: string; dir: string } | null {
  let current = startDir;
  for (;;) {
    for (const name of CONFIG_FILES) {
      const p = join(current, name);
      if (existsSync(p)) return { path: p, dir: current };
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

const KEY_MAP: Record<string, keyof GroqlabConfig> = {
  projectid: "projectId",
  project_id: "projectId",
  "project-id": "projectId",
  project: "projectId",
  dataset: "dataset",
  token: "token",
  url: "url",
};

function parseKeyValue(raw: string): GroqlabConfig {
  const config: GroqlabConfig = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.includes(": ") ? ": " : ":";
    const idx = trimmed.indexOf(sep);
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim().toLowerCase();
    const value = trimmed.slice(idx + sep.length).trim();
    const mapped = KEY_MAP[key];
    if (mapped && value) config[mapped] = value;
  }
  return config;
}

function readConfig(path: string): GroqlabConfig {
  try {
    const raw = readFileSync(path, "utf-8");
    if (path.endsWith(".json")) {
      return JSON.parse(raw) as GroqlabConfig;
    }
    return parseKeyValue(raw);
  } catch {
    return {};
  }
}

export function loadConfig(
  cliFlags?: Record<string, string | undefined>,
  cwd?: string,
): GroqlabConfig {
  const file = findConfig(cwd ?? process.cwd());
  const fileConfig: GroqlabConfig = file ? readConfig(file.path) : {};

  const envConfig: GroqlabConfig = {};
  if (process.env.GROQLAB_PROJECT) envConfig.projectId = process.env.GROQLAB_PROJECT;
  if (process.env.GROQLAB_DATASET) envConfig.dataset = process.env.GROQLAB_DATASET;
  if (process.env.GROQLAB_TOKEN) envConfig.token = process.env.GROQLAB_TOKEN;
  if (process.env.GROQLAB_URL) envConfig.url = process.env.GROQLAB_URL;

  const flagConfig: GroqlabConfig = {};
  if (cliFlags) {
    if (cliFlags.project) flagConfig.projectId = cliFlags.project;
    if (cliFlags.dataset) flagConfig.dataset = cliFlags.dataset;
    if (cliFlags.token) flagConfig.token = cliFlags.token;
    if (cliFlags.url) flagConfig.url = cliFlags.url;
  }

  return { ...fileConfig, ...envConfig, ...flagConfig };
}

export function requireConnection(
  config: GroqlabConfig,
): { projectId: string; dataset: string; token?: string } {
  if (!config.projectId || !config.dataset) {
    console.error(
      "Error: --project and --dataset are required (set in groqlab.json, env, or pass as flags).",
    );
    process.exit(1);
  }
  return {
    projectId: config.projectId,
    dataset: config.dataset,
    token: config.token || undefined,
  };
}
