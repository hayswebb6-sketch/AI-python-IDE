export async function pushWorkspaceToGitHub({ owner, repository, branch, message, token, files, fetchImpl = fetch, signal }) {
  if (!owner || !repository || !branch || !message || !token) {
    throw new Error("Repository, branch, commit message, and token are required.");
  }
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("There are no workspace files to push.");
  }

  const tree = files.map(({ path, content }) => {
    const safePath = String(path).replace(/\\/g, "/");
    if (!safePath || safePath.startsWith("/") || safePath.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("A workspace file has an invalid repository path.");
    }
    return { path: safePath, mode: "100644", type: "blob", content: String(content ?? "") };
  });
  if (new Set(tree.map((entry) => entry.path)).size !== tree.length) {
    throw new Error("Workspace paths must be unique after normalization.");
  }

  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  const encodedBranch = branch.split("/").map(encodeURIComponent).join("/");
  const request = async (path, options = {}) => {
    const response = await fetchImpl(`https://api.github.com${path}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      signal,
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `GitHub returned HTTP ${response.status}.`);
    return data;
  };

  const ref = await request(`${repoPath}/git/ref/heads/${encodedBranch}`);
  const parentSha = ref.object?.sha;
  if (!parentSha) throw new Error("Could not read the selected branch.");
  const parent = await request(`${repoPath}/git/commits/${encodeURIComponent(parentSha)}`);
  const newTree = await request(`${repoPath}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: parent.tree?.sha, tree }),
  });
  const commit = await request(`${repoPath}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: newTree.sha, parents: [parentSha] }),
  });
  await request(`${repoPath}/git/refs/heads/${encodedBranch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return { sha: commit.sha, url: commit.html_url || "", fileCount: tree.length };
}