import { NextRequest, NextResponse } from 'next/server';

/**
 * API route to fetch GitHub issues
 * This keeps the GitHub token secure on the server side
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');

    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'Missing owner or repo parameters' },
        { status: 400 }
      );
    }

    // Get token from environment variable (server-side only)
    // Support both GITHUB_APIKEY and GITHUB-APIKEY (though underscores are standard)
    const token = process.env.GITHUB_APIKEY || process.env['GITHUB-APIKEY'];

    if (!token) {
      // Don't fail in production if token is missing - return helpful error
      return NextResponse.json(
        { error: 'GitHub API key not configured. Please set GITHUB_APIKEY in Vercel environment variables.' },
        { status: 503 } // Service unavailable, not 500
      );
    }

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
        return NextResponse.json(
          { error: 'Invalid GitHub token. Please check your GITHUB_APIKEY in Vercel environment variables.' },
          { status: 401 }
        );
      }
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Repository not found. Please check the owner and repo name.' },
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

    return NextResponse.json({ issues: filteredIssues });
  } catch (error: any) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
