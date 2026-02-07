import { describe, it, expect } from 'vitest';
import { calculateWeeklyMetrics } from './metrics-calculator.js';
import type { GitHubActivity } from '../types/github.js';
import type { JiraActivity } from '../types/jira.js';

const emptyGitHub: GitHubActivity = {
  username: 'testuser',
  commits: [],
  pullRequests: [],
  reviews: [],
  timeRange: { from: '2026-02-01T00:00:00Z', to: '2026-02-07T00:00:00Z' },
};

describe('calculateWeeklyMetrics', () => {
  it('returns zeroed metrics for empty activity', () => {
    const m = calculateWeeklyMetrics(emptyGitHub);

    expect(m.totalCommits).toBe(0);
    expect(m.pullRequests.total).toBe(0);
    expect(m.pullRequests.open).toBe(0);
    expect(m.pullRequests.merged).toBe(0);
    expect(m.pullRequests.closed).toBe(0);
    expect(m.additions).toBe(0);
    expect(m.deletions).toBe(0);
    expect(m.reviews.total).toBe(0);
    expect(m.repoBreakdown).toHaveLength(0);
    expect(m.jira).toBeUndefined();
  });

  it('counts commits correctly', () => {
    const github: GitHubActivity = {
      ...emptyGitHub,
      commits: [
        {
          sha: 'a1',
          message: 'feat: add login',
          author: 'testuser',
          date: '',
          repo: 'org/app',
          url: '',
        },
        { sha: 'a2', message: 'fix: typo', author: 'testuser', date: '', repo: 'org/app', url: '' },
        {
          sha: 'a3',
          message: 'docs: readme',
          author: 'testuser',
          date: '',
          repo: 'org/lib',
          url: '',
        },
      ],
    };

    const m = calculateWeeklyMetrics(github);
    expect(m.totalCommits).toBe(3);
    expect(m.repoBreakdown).toHaveLength(2);
  });

  it('categorizes PRs by state', () => {
    const github: GitHubActivity = {
      ...emptyGitHub,
      pullRequests: [
        {
          number: 1,
          title: 'Open PR',
          state: 'open',
          author: 'u',
          createdAt: '',
          updatedAt: '',
          repo: 'org/a',
          url: '',
        },
        {
          number: 2,
          title: 'Merged PR',
          state: 'merged',
          author: 'u',
          createdAt: '',
          updatedAt: '',
          mergedAt: '',
          repo: 'org/a',
          url: '',
        },
        {
          number: 3,
          title: 'Closed PR',
          state: 'closed',
          author: 'u',
          createdAt: '',
          updatedAt: '',
          repo: 'org/a',
          url: '',
        },
        {
          number: 4,
          title: 'Merged 2',
          state: 'merged',
          author: 'u',
          createdAt: '',
          updatedAt: '',
          mergedAt: '',
          repo: 'org/b',
          url: '',
        },
      ],
    };

    const m = calculateWeeklyMetrics(github);
    expect(m.pullRequests.total).toBe(4);
    expect(m.pullRequests.open).toBe(1);
    expect(m.pullRequests.merged).toBe(2);
    expect(m.pullRequests.closed).toBe(1);
  });

  it('handles undefined additions/deletions gracefully', () => {
    const github: GitHubActivity = {
      ...emptyGitHub,
      pullRequests: [
        {
          number: 1,
          title: 'With stats',
          state: 'merged',
          author: 'u',
          createdAt: '',
          updatedAt: '',
          repo: 'org/a',
          url: '',
          additions: 100,
          deletions: 50,
        },
        {
          number: 2,
          title: 'No stats',
          state: 'open',
          author: 'u',
          createdAt: '',
          updatedAt: '',
          repo: 'org/a',
          url: '',
        },
      ],
    };

    const m = calculateWeeklyMetrics(github);
    expect(m.additions).toBe(100);
    expect(m.deletions).toBe(50);
  });

  it('categorizes reviews by state', () => {
    const github: GitHubActivity = {
      ...emptyGitHub,
      reviews: [
        {
          pullRequestNumber: 1,
          pullRequestTitle: 'PR1',
          author: 'u',
          state: 'APPROVED',
          submittedAt: '',
          repo: 'org/a',
        },
        {
          pullRequestNumber: 2,
          pullRequestTitle: 'PR2',
          author: 'u',
          state: 'CHANGES_REQUESTED',
          submittedAt: '',
          repo: 'org/a',
        },
        {
          pullRequestNumber: 3,
          pullRequestTitle: 'PR3',
          author: 'u',
          state: 'COMMENTED',
          submittedAt: '',
          repo: 'org/b',
        },
        {
          pullRequestNumber: 4,
          pullRequestTitle: 'PR4',
          author: 'u',
          state: 'PENDING',
          submittedAt: '',
          repo: 'org/b',
        },
      ],
    };

    const m = calculateWeeklyMetrics(github);
    expect(m.reviews.total).toBe(4);
    expect(m.reviews.approved).toBe(1);
    expect(m.reviews.changesRequested).toBe(1);
    expect(m.reviews.commented).toBe(2); // COMMENTED + PENDING both go to commented
  });

  it('sorts repo breakdown by total activity descending', () => {
    const github: GitHubActivity = {
      ...emptyGitHub,
      commits: [
        { sha: 'a', message: '', author: 'u', date: '', repo: 'org/small', url: '' },
        { sha: 'b', message: '', author: 'u', date: '', repo: 'org/big', url: '' },
        { sha: 'c', message: '', author: 'u', date: '', repo: 'org/big', url: '' },
        { sha: 'd', message: '', author: 'u', date: '', repo: 'org/big', url: '' },
      ],
      pullRequests: [
        {
          number: 1,
          title: '',
          state: 'open',
          author: 'u',
          createdAt: '',
          updatedAt: '',
          repo: 'org/big',
          url: '',
        },
      ],
    };

    const m = calculateWeeklyMetrics(github);
    expect(m.repoBreakdown[0]!.repo).toBe('org/big');
    expect(m.repoBreakdown[1]!.repo).toBe('org/small');
  });

  it('calculates Jira metrics when provided', () => {
    const jira: JiraActivity = {
      issues: [
        {
          key: 'P-1',
          summary: 's',
          status: 'Done',
          priority: 'High',
          assignee: 'u',
          issueType: 'Bug',
          updatedAt: '',
          url: '',
        },
        {
          key: 'P-2',
          summary: 's',
          status: 'In Progress',
          priority: 'Medium',
          assignee: 'u',
          issueType: 'Story',
          updatedAt: '',
          url: '',
        },
        {
          key: 'P-3',
          summary: 's',
          status: 'Done',
          priority: 'High',
          assignee: 'u',
          issueType: 'Bug',
          updatedAt: '',
          url: '',
        },
      ],
      timeRange: { from: '', to: '' },
    };

    const m = calculateWeeklyMetrics(emptyGitHub, jira);
    expect(m.jira).toBeDefined();
    expect(m.jira!.totalIssues).toBe(3);
    expect(m.jira!.byStatus['Done']).toBe(2);
    expect(m.jira!.byStatus['In Progress']).toBe(1);
    expect(m.jira!.byPriority['High']).toBe(2);
    expect(m.jira!.byType['Bug']).toBe(2);
    expect(m.jira!.byType['Story']).toBe(1);
  });

  it('omits Jira metrics when not provided', () => {
    const m = calculateWeeklyMetrics(emptyGitHub);
    expect(m.jira).toBeUndefined();
  });
});
