import { execFile } from "child_process";
import * as path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function runGit(args: string[], cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
    return stdout.trim();
  } catch {
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
