import { Effect, Layer } from "effect";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type { UserCommand } from "@t3tools/contracts";

import {
  UserCommandsLoader,
  UserCommandsLoaderError,
  type UserCommandsLoaderShape,
} from "../Services/UserCommandsLoader.ts";

const COMMAND_EXTENSIONS = new Set([".md", ".toml"]);
const SKILL_EXTENSIONS = new Set([".md"]);

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readDirEntries(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function walkCommandFiles(
  root: string,
  extensions: Set<string>,
  relativeSegments: ReadonlyArray<string> = [],
): Promise<Array<{ absolutePath: string; relativeSegments: ReadonlyArray<string> }>> {
  const entries = await readDirEntries(root);
  const results: Array<{ absolutePath: string; relativeSegments: ReadonlyArray<string> }> = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkCommandFiles(absolutePath, extensions, [
        ...relativeSegments,
        entry.name,
      ]);
      results.push(...nested);
    } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
      results.push({ absolutePath, relativeSegments });
    }
  }
  return results;
}

interface ParsedCommand {
  readonly description?: string;
  readonly prompt: string;
}

function parseMarkdownCommand(raw: string): ParsedCommand {
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/.exec(raw);
  if (!match) {
    return { prompt: raw.trim() };
  }
  const frontmatter = match[1] ?? "";
  const body = raw.slice(match[0].length).trim();
  let description: string | undefined;
  for (const line of frontmatter.split(/\r?\n/)) {
    const kv = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (!kv) continue;
    const key = kv[1]?.toLowerCase();
    let value = kv[2] ?? "";
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key === "description" && value) {
      description = value;
    }
  }
  return description ? { description, prompt: body } : { prompt: body };
}

function parseTomlCommand(raw: string): ParsedCommand {
  let description: string | undefined;
  let prompt = "";
  const lines = raw.split(/\r?\n/);
  let inPromptBlock = false;
  let promptBlockLines: string[] = [];
  let promptBlockDelimiter: '"""' | "'''" | null = null;

  for (const line of lines) {
    if (inPromptBlock && promptBlockDelimiter) {
      if (line.trimEnd().endsWith(promptBlockDelimiter)) {
        promptBlockLines.push(line.slice(0, line.lastIndexOf(promptBlockDelimiter)));
        prompt = promptBlockLines.join("\n");
        inPromptBlock = false;
        promptBlockDelimiter = null;
        promptBlockLines = [];
      } else {
        promptBlockLines.push(line);
      }
      continue;
    }
    const kv = /^\s*([A-Za-z0-9_-]+)\s*=\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1]?.toLowerCase();
    const rawValue = (kv[2] ?? "").trim();
    if (key === "description") {
      description = unquoteTomlString(rawValue);
    } else if (key === "prompt") {
      if (rawValue.startsWith('"""') || rawValue.startsWith("'''")) {
        const delim = rawValue.slice(0, 3) as '"""' | "'''";
        const rest = rawValue.slice(3);
        if (rest.endsWith(delim) && rest.length >= 3) {
          prompt = rest.slice(0, rest.length - 3);
        } else {
          inPromptBlock = true;
          promptBlockDelimiter = delim;
          promptBlockLines = rest ? [rest] : [];
        }
      } else {
        prompt = unquoteTomlString(rawValue);
      }
    }
  }

  return description ? { description, prompt } : { prompt };
}

function unquoteTomlString(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  }
  return trimmed;
}

function buildCommandId(params: {
  readonly source: "user" | "plugin";
  readonly namespace?: string;
  readonly commandName: string;
}): string {
  const prefix = params.source === "user" ? "user" : `plugin:${params.namespace ?? "unknown"}`;
  return `${prefix}:${params.commandName}`;
}

function commandNameFromFile(
  fileBasename: string,
  relativeSegments: ReadonlyArray<string>,
): string {
  const base = fileBasename.replace(/\.(md|toml)$/i, "");
  if (relativeSegments.length === 0) return base;
  return [...relativeSegments, base].join("/");
}

async function parseCommandFile(params: {
  readonly absolutePath: string;
  readonly relativeSegments: ReadonlyArray<string>;
  readonly source: "user" | "plugin";
  readonly namespace?: string;
}): Promise<UserCommand | null> {
  let raw: string;
  try {
    raw = await fs.readFile(params.absolutePath, "utf8");
  } catch {
    return null;
  }
  const extension = path.extname(params.absolutePath).toLowerCase();
  const parsed =
    extension === ".toml" ? parseTomlCommand(raw) : parseMarkdownCommand(raw);
  if (!parsed.prompt.trim()) return null;

  const basename = path.basename(params.absolutePath);
  const commandName = commandNameFromFile(basename, params.relativeSegments);
  const result: UserCommand = {
    id: buildCommandId({
      source: params.source,
      commandName,
      ...(params.namespace !== undefined ? { namespace: params.namespace } : {}),
    }),
    name: commandName,
    prompt: parsed.prompt,
    source: params.source,
    sourcePath: params.absolutePath,
    ...(params.namespace !== undefined ? { namespace: params.namespace } : {}),
    ...(parsed.description !== undefined ? { description: parsed.description } : {}),
  };
  return result;
}

async function loadUserCommandsFromDirectory(
  dir: string,
  extensions: Set<string>,
  source: "user" | "plugin",
  namespace?: string,
): Promise<ReadonlyArray<UserCommand>> {
  if (!(await pathExists(dir))) return [];
  const files = await walkCommandFiles(dir, extensions);
  const results: UserCommand[] = [];
  for (const file of files) {
    const command = await parseCommandFile({
      absolutePath: file.absolutePath,
      relativeSegments: file.relativeSegments,
      source,
      ...(namespace !== undefined ? { namespace } : {}),
    });
    if (command) results.push(command);
  }
  return results;
}

async function findPluginCommandDirectories(
  pluginsCacheRoot: string,
): Promise<Array<{ namespace: string; commandsDir: string; skillsDir: string }>> {
  if (!(await pathExists(pluginsCacheRoot))) return [];
  const results: Array<{ namespace: string; commandsDir: string; skillsDir: string }> = [];
  const marketplaces = await readDirEntries(pluginsCacheRoot);
  for (const marketplace of marketplaces) {
    if (!marketplace.isDirectory()) continue;
    const plugins = await readDirEntries(path.join(pluginsCacheRoot, marketplace.name));
    for (const plugin of plugins) {
      if (!plugin.isDirectory()) continue;
      const versions = await readDirEntries(
        path.join(pluginsCacheRoot, marketplace.name, plugin.name),
      );
      for (const version of versions) {
        if (!version.isDirectory()) continue;
        const pluginRoot = path.join(pluginsCacheRoot, marketplace.name, plugin.name, version.name);
        results.push({
          namespace: plugin.name,
          commandsDir: path.join(pluginRoot, "commands"),
          skillsDir: path.join(pluginRoot, "skills"),
        });
      }
    }
  }
  return results;
}

function dedupeById(commands: ReadonlyArray<UserCommand>): ReadonlyArray<UserCommand> {
  const seen = new Map<string, UserCommand>();
  for (const command of commands) {
    if (!seen.has(command.id)) {
      seen.set(command.id, command);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export const makeUserCommandsLoader = Effect.sync(() => {
  const claudeHome = path.join(os.homedir(), ".claude");

  const list: UserCommandsLoaderShape["list"] = () =>
    Effect.tryPromise({
      try: async () => {
        const userCommandsDir = path.join(claudeHome, "commands");
        const userCommands = await loadUserCommandsFromDirectory(
          userCommandsDir,
          COMMAND_EXTENSIONS,
          "user",
        );

        const pluginsCacheRoot = path.join(claudeHome, "plugins", "cache");
        const pluginDirs = await findPluginCommandDirectories(pluginsCacheRoot);

        const pluginResults: UserCommand[] = [];
        for (const plugin of pluginDirs) {
          const commands = await loadUserCommandsFromDirectory(
            plugin.commandsDir,
            COMMAND_EXTENSIONS,
            "plugin",
            plugin.namespace,
          );
          pluginResults.push(...commands);
          const skills = await loadUserCommandsFromDirectory(
            plugin.skillsDir,
            SKILL_EXTENSIONS,
            "plugin",
            plugin.namespace,
          );
          pluginResults.push(...skills);
        }

        return dedupeById([...userCommands, ...pluginResults]);
      },
      catch: (cause) =>
        new UserCommandsLoaderError({
          detail: cause instanceof Error ? cause.message : "Failed to load user commands",
          cause,
        }),
    });

  return { list } satisfies UserCommandsLoaderShape;
});

export const UserCommandsLoaderLive = Layer.effect(UserCommandsLoader, makeUserCommandsLoader);
