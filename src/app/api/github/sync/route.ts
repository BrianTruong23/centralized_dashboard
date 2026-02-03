import { NextRequest, NextResponse } from 'next/server';

/**
 * API route to sync GitHub issues directly
 * Uses GITHUB_REPO and GITHUB_APIKEY from environment variables
 */
export async function POST(request: NextRequest) {
  try {
    // Get repo and token from environment variables
    const repo = process.env.GITHUB_REPO || process.env['GITHUB-REPO'];
    const token = process.env.GITHUB_APIKEY || process.env['GITHUB-APIKEY'] || process.env.NEXT_PUBLIC_GITHUB_APIKEY;

    if (!repo) {
      return NextResponse.json(
        { error: 'GITHUB_REPO not configured. Please set GITHUB_REPO in Vercel environment variables.' },
        { status: 503 } // Service unavailable
      );
    }

    if (!token) {
      return NextResponse.json(
        { error: 'GITHUB_APIKEY not configured. Please set GITHUB_APIKEY in Vercel environment variables.' },
        { status: 503 } // Service unavailable
      );
    }

    // Parse repo (format: owner/repo)
    const parts = repo.trim().split('/');
    if (parts.length !== 2) {
      return NextResponse.json(
        { error: 'Invalid GITHUB_REPO format. Use: owner/repo (e.g., facebook/react)' },
        { status: 400 }
      );
    }

    const [owner, repoName] = parts;

    const url = `https://api.github.com/repos/${owner}/${repoName}/issues?state=all&per_page=100`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Centralized-Dashboard',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'Invalid GitHub token. Please check your GITHUB_APIKEY in Vercel environment variables.' },
          { status: 401 }
        );
      }
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Repository not found. Please check your GITHUB_REPO in Vercel environment variables.' },
          { status: 404 }
        );
      }
      const errorText = await response.text();
      return NextResponse.json(
        { error: `GitHub API error: ${response.statusText}`, details: errorText },
        { status: response.status }
      );
    }

    const issues = await response.json();
    // Filter out pull requests (they have pull_request field)
    const filteredIssues = issues.filter((issue: any) => !issue.pull_request);

    return NextResponse.json({ 
      issues: filteredIssues,
      repo: repo,
      owner: owner,
      repoName: repoName
    });
  } catch (error: any) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to retrieve configured repo from env
 */
export async function GET() {
  try {
    const repo = process.env.GITHUB_REPO || process.env['GITHUB-REPO'];
    
    return NextResponse.json({ 
      repo: repo || null,
      configured: !!repo
    });
  } catch (error: any) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
