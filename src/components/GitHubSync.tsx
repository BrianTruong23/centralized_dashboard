'use client';

import { useState, useEffect } from 'react';
import { fetchGitHubIssues, parseRepo, validateGitHubToken, mapGitHubStateToStatus, GitHubIssue } from '@/lib/github';
import { ideasDb } from '@/lib/ideas';
import { Idea } from '@/types/idea';
import { Github, RefreshCw, X, Check } from 'lucide-react';

interface GitHubSyncProps {
  userId: string;
  onSyncComplete: () => void;
}

export function GitHubSync({ userId, onSyncComplete }: GitHubSyncProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewIssues, setPreviewIssues] = useState<GitHubIssue[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // Load repo from environment variable via API
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/github/sync');
        if (response.ok) {
          const data = await response.json();
          if (data.repo) {
            setRepo(data.repo);
          }
        }
      } catch (err) {
        console.error('Failed to load GitHub config:', err);
      }
      
      // Load saved repo from localStorage (token is never persisted for security)
      if (typeof window !== 'undefined') {
        const savedRepo = localStorage.getItem('github_repo');
        if (savedRepo) {
          setRepo(prev => prev || savedRepo);
        }
        // SECURITY: Never load tokens from localStorage to prevent XSS vulnerabilities
        // Tokens should only be entered manually or configured via environment variables
      }
    };
    
    loadConfig();
  }, []);

  const handleConnect = async () => {
    setError(null);
    setSuccess(null);
    setPreviewIssues([]);
    setShowPreview(false);

    // If repo is from env var, use the sync API endpoint
    if (repo.trim() && !token.trim()) {
      // Try using the auto-sync endpoint first (uses env vars)
      setLoading(true);
      try {
        const response = await fetch('/api/github/sync', { method: 'POST' });
        if (response.ok) {
          const data = await response.json();
          setPreviewIssues(data.issues);
          setShowPreview(true);
          setSuccess(`Found ${data.issues.length} issues from ${data.repo}`);
          setLoading(false);
          return;
        } else {
          const error = await response.json();
          throw new Error(error.error || 'Failed to fetch issues');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch issues from GitHub');
        setLoading(false);
        return;
      }
    }

    // Manual mode: validate inputs
    if (!repo.trim()) {
      setError('Please enter a repository or set GITHUB_REPO in .env.local');
      return;
    }

    // Token is optional if using env var (will use API route)
    // But validate if manually provided
    if (token.trim() && !validateGitHubToken(token)) {
      setError('Invalid token format. Please check your GitHub personal access token.');
      return;
    }

    const repoInfo = parseRepo(repo);
    if (!repoInfo) {
      setError('Invalid repository format. Use: owner/repo (e.g., facebook/react)');
      return;
    }

    setLoading(true);
    try {
      // Pass token only if provided, otherwise use API route with env var
      const issues = await fetchGitHubIssues(repoInfo.owner, repoInfo.repo, token.trim() || undefined);
      setPreviewIssues(issues);
      setShowPreview(true);
      setSuccess(`Found ${issues.length} issues`);

      // Save only the repo to localStorage (never save tokens for security)
      localStorage.setItem('github_repo', repo);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch issues from GitHub');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (previewIssues.length === 0) {
      setError('No issues to sync');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Fetch existing local ideas to check for duplicates
      const existingIdeas = await ideasDb.fetchIdeas();
      
      // Create a set of already synced GitHub issue numbers for faster lookup
      const syncedIssueNumbers = new Set(
        existingIdeas
          .filter(idea => idea.description?.includes('🔗 GitHub:'))
          .map(idea => {
            // Extract issue number from GitHub URL in description
            const githubUrlMatch = idea.description?.match(/github\.com\/[^\/]+\/[^\/]+\/issues\/(\d+)/);
            return githubUrlMatch ? parseInt(githubUrlMatch[1]) : null;
          })
          .filter((num): num is number => num !== null)
      );

      let synced = 0;
      let skipped = 0;

      // Append all GitHub issues to backlog, maintaining local list
      for (const issue of previewIssues) {
        try {
          // Check if this GitHub issue number already exists
          if (syncedIssueNumbers.has(issue.number)) {
            skipped++;
            continue;
          }

          // Always add GitHub issues to backlog (as requested)
          // Format: include issue number and GitHub link in description
          const description = `${issue.body || ''}\n\n🔗 GitHub Issue #${issue.number}: ${issue.html_url}`;

          await ideasDb.addIdea({
            title: `[GitHub] ${issue.title}`,
            description: description.trim(),
            status: 'backlog', // Always append to backlog
            user_id: userId,
          });

          synced++;
          // Add to set to avoid duplicates in same sync batch
          syncedIssueNumbers.add(issue.number);
        } catch (err) {
          console.error(`Failed to sync issue #${issue.number}:`, err);
        }
      }

      setSuccess(`Added ${synced} GitHub issues to backlog${skipped > 0 ? `, skipped ${skipped} duplicates` : ''}`);
      setShowPreview(false);
      setPreviewIssues([]);
      
      // Refresh the kanban board to show new issues
      setTimeout(() => {
        onSyncComplete();
        setIsOpen(false);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to sync issues');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSync = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Use the sync API endpoint which reads from env vars
      const response = await fetch('/api/github/sync', { method: 'POST' });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to sync from GitHub');
      }

      const data = await response.json();
      const issues = data.issues;

      if (issues.length === 0) {
        setSuccess('No new issues to sync');
        setLoading(false);
        return;
      }

      // Fetch existing ideas to check for duplicates
      const existingIdeas = await ideasDb.fetchIdeas();
      const syncedIssueNumbers = new Set(
        existingIdeas
          .filter(idea => idea.description?.includes('🔗 GitHub:'))
          .map(idea => {
            const githubUrlMatch = idea.description?.match(/github\.com\/[^\/]+\/[^\/]+\/issues\/(\d+)/);
            return githubUrlMatch ? parseInt(githubUrlMatch[1]) : null;
          })
          .filter((num): num is number => num !== null)
      );

      let synced = 0;
      let skipped = 0;

      for (const issue of issues) {
        if (syncedIssueNumbers.has(issue.number)) {
          skipped++;
          continue;
        }

        const description = `${issue.body || ''}\n\n🔗 GitHub Issue #${issue.number}: ${issue.html_url}`;

        await ideasDb.addIdea({
          title: `[GitHub] ${issue.title}`,
          description: description.trim(),
          status: 'backlog',
          user_id: userId,
        });

        synced++;
        syncedIssueNumbers.add(issue.number);
      }

      setSuccess(`Synced ${synced} issues to backlog${skipped > 0 ? `, skipped ${skipped} duplicates` : ''}`);
      
      // Refresh the kanban board
      setTimeout(() => {
        onSyncComplete();
        setSuccess(null);
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to sync issues');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {loading && (
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <RefreshCw size={12} className="animate-spin" />
            Syncing...
          </div>
        )}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
            {error}
          </div>
        )}
        {success && (
          <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
            {success}
          </div>
        )}
        <button
          onClick={handleQuickSync}
          disabled={loading}
          className="bg-black text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Quick Sync
        </button>
        <button
          onClick={() => setIsOpen(true)}
          className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-gray-200 transition-colors"
        >
          <Github size={16} />
          Manual Sync
        </button>
      </div>

      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" 
          onClick={() => {
            setIsOpen(false);
            setError(null);
            setSuccess(null);
            setPreviewIssues([]);
            setShowPreview(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="p-6 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Github size={24} className="text-gray-700" />
                <h2 className="text-xl font-bold">Sync GitHub Issues</h2>
              </div>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setError(null);
                  setSuccess(null);
                  setPreviewIssues([]);
                  setShowPreview(false);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GitHub Repository
                  </label>
                  <input
                    type="text"
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                    placeholder="owner/repo (e.g., facebook/react)"
                    className="w-full border border-gray-200 p-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {repo && repo.includes('/') ? (
                      <span className="text-green-600">✓ Repository configured</span>
                    ) : (
                      <>
                        Enter repository in format: owner/repository-name
                        {' '}or set GITHUB_REPO in .env.local
                      </>
                    )}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GitHub Personal Access Token
                  </label>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxx"
                    className="w-full border border-gray-200 p-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Optional: Leave empty if GITHUB_APIKEY is set in .env.local
                    {' '}
                    <a
                      href="https://github.com/settings/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline"
                    >
                      Create a token here
                    </a>
                    {' '}(needs `repo` scope for private repos)
                  </p>
                  <p className="text-xs text-amber-600 mt-1 bg-amber-50 p-2 rounded border border-amber-200">
                    🔒 Security: Tokens are never stored in your browser for security. Use environment variables for persistent configuration.
                  </p>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                    {error}
                  </div>
                )}

                {success && !showPreview && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-600 flex items-center gap-2">
                    <Check size={16} />
                    {success}
                  </div>
                )}

                {showPreview && previewIssues.length > 0 && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium">Preview ({previewIssues.length} issues)</h3>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        Will be added to Backlog
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                      These issues will be appended to your backlog. Existing local ideas will be preserved.
                    </p>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {previewIssues.slice(0, 10).map((issue) => (
                        <div key={issue.id} className="text-sm p-2 bg-gray-50 rounded">
                          <div className="font-medium">#{issue.number} {issue.title}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            GitHub: {issue.state === 'open' ? 'Open' : 'Closed'}
                          </div>
                        </div>
                      ))}
                      {previewIssues.length > 10 && (
                        <div className="text-xs text-gray-500 text-center pt-2">
                          ... and {previewIssues.length - 10} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setError(null);
                  setSuccess(null);
                  setPreviewIssues([]);
                  setShowPreview(false);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              {!showPreview ? (
                <button
                  onClick={handleConnect}
                  disabled={loading || !repo.trim()}
                  className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Github size={16} />
                      Connect & Preview
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleSync}
                  disabled={loading}
                  className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} />
                      Sync to Kanban
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
