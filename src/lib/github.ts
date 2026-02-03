
/**
 * GitHub API integration for syncing issues to kanban board
 */

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<{ name: string; color: string }>;
  created_at: string;
  updated_at: string;
  html_url: string;
  assignee: { login: string } | null;
}

export interface GitHubRepo {
  owner: string;
  repo: string;
}

/**
 * Fetch issues from a GitHub repository
 * Uses API route if token is not provided (reads from env var)
 */
export async function fetchGitHubIssues(
  owner: string,
  repo: string,
  token?: string
): Promise<GitHubIssue[]> {
  // If token is provided, use direct API call (for manual token input)
  if (token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Centralized-Dashboard',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid GitHub token. Please check your personal access token.');
      }
      if (response.status === 404) {
        throw new Error('Repository not found. Please check the owner and repo name.');
      }
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const issues: GitHubIssue[] = await response.json();
    // Filter out pull requests (they have pull_request field)
    return issues.filter((issue: any) => !issue.pull_request);
  }

  // Otherwise, use API route (reads from server-side env var)
  const apiUrl = `/api/github/issues?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`;
  const response = await fetch(apiUrl);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch issues from GitHub');
  }

  const data = await response.json();
  return data.issues;
}

/**
 * Map GitHub issue state to kanban status
 */
export function mapGitHubStateToStatus(state: 'open' | 'closed', labels: Array<{ name: string }>): 'backlog' | 'planned' | 'in-progress' | 'done' {
  if (state === 'closed') {
    return 'done';
  }

  // Check labels for status hints
  const labelNames = labels.map(l => l.name.toLowerCase());
  
  if (labelNames.some(l => l.includes('in progress') || l.includes('doing'))) {
    return 'in-progress';
  }
  if (labelNames.some(l => l.includes('planned') || l.includes('todo'))) {
    return 'planned';
  }
  
  // Default open issues to backlog
  return 'backlog';
}

/**
 * Parse repository string (owner/repo) into parts
 */
export function parseRepo(repoString: string): GitHubRepo | null {
  const parts = repoString.trim().split('/');
  if (parts.length !== 2) {
    return null;
  }
  return {
    owner: parts[0],
    repo: parts[1],
  };
}

/**
 * Validate GitHub token format (basic check)
 */
export function validateGitHubToken(token: string): boolean {
  // GitHub tokens are typically 40+ characters
  return token.trim().length >= 20;
}
