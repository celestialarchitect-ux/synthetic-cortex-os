import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const REPO = "celestialarchitect-ux/synthetic-cortex-os";
const VERSION = process.env.npm_package_version ?? "0.0.0";

export async function GET() {
  const commit =
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.BUILD_COMMIT ??
    "local";
  const commitMessage = process.env.RAILWAY_GIT_COMMIT_MESSAGE ?? null;
  const buildTime = process.env.BUILD_TIME ?? new Date().toISOString();
  const serviceId = process.env.RAILWAY_SERVICE_ID ?? null;
  const deploymentId = process.env.RAILWAY_DEPLOYMENT_ID ?? null;
  const environment = process.env.RAILWAY_ENVIRONMENT ?? "local";

  let lastCommit: { sha: string; message: string; date: string; author: string } | null = null;
  let totalCommits: number | null = null;
  let openIssues: number | null = null;
  let defaultBranch: string | null = null;

  // Pull live GitHub stats (60 req/hour unauth is plenty for this)
  try {
    const [repoRes, commitsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${REPO}`, {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: 300 },
      }),
      fetch(`https://api.github.com/repos/${REPO}/commits?per_page=1`, {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: 300 },
      }),
    ]);

    if (repoRes.ok) {
      const repo = (await repoRes.json()) as {
        open_issues_count?: number;
        default_branch?: string;
      };
      openIssues = repo.open_issues_count ?? null;
      defaultBranch = repo.default_branch ?? null;
    }

    if (commitsRes.ok) {
      const commits = (await commitsRes.json()) as Array<{
        sha: string;
        commit: { message: string; author: { date: string; name: string } };
      }>;
      if (Array.isArray(commits) && commits[0]) {
        lastCommit = {
          sha: commits[0].sha,
          message: commits[0].commit.message.split("\n")[0],
          date: commits[0].commit.author.date,
          author: commits[0].commit.author.name,
        };
      }
      const linkHeader = commitsRes.headers.get("link") ?? "";
      const match = linkHeader.match(/page=(\d+)>;\s*rel="last"/);
      if (match) totalCommits = parseInt(match[1], 10);
    }
  } catch {
    // GitHub unreachable — return what we have
  }

  return NextResponse.json({
    version: VERSION,
    commit,
    commitMessage,
    buildTime,
    environment,
    serviceId,
    deploymentId,
    repoUrl: `https://github.com/${REPO}`,
    repo: REPO,
    defaultBranch,
    openIssues,
    lastCommit,
    totalCommits,
  });
}
