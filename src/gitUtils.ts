import { promisify } from "util";
import { execFile } from "child_process";
import * as path from "path";

const execFileAsync = promisify(execFile);

async function runGit(args: string[], cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
    return stdout.trim();
  } catch (error) {
    return undefined;
  }
}

export async function getRepositoryRoot(startPath: string): Promise<string | undefined> {
  const output = await runGit(["rev-parse", "--show-toplevel"], startPath);
  return output ? path.normalize(output) : undefined;
}

export async function getCurrentBranch(startPath: string): Promise<string | undefined> {
  return runGit(["rev-parse", "--abbrev-ref", "HEAD"], startPath);
}

export async function getRemoteUrl(startPath: string, remote = "origin"): Promise<string | undefined> {
  return runGit(["remote", "get-url", remote], startPath);
}

export function deriveRepositorySlug(remoteUrl?: string): string | undefined {
  if (!remoteUrl) {
    return undefined;
  }

  const sshMatch = remoteUrl.match(/@(.*):(.+?)(\.git)?$/);
  if (sshMatch) {
    return sshMatch[2];
  }

  try {
    const parsed = new URL(remoteUrl);
    const slug = parsed.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
    return slug || undefined;
  } catch (_error) {
    return undefined;
  }
}
