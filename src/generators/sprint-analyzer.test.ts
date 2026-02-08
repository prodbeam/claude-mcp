import { describe, it, expect } from 'vitest';
import { analyzeSprintActivity } from './sprint-analyzer.js';
import type { GitHubActivity } from '../types/github.js';
import type { JiraActivity } from '../types/jira.js';

const emptyGitHub: GitHubActivity = {
  username: 'testuser',
  commits: [],
  pullRequests: [],
  reviews: [],
  timeRange: { from: '2026-01-20T00:00:00Z', to: '2026-02-03T00:00:00Z' },
};

describe('analyzeSprintActivity', () => {
  it('returns zeroed metrics for empty activity', () => {
    const m = analyzeSprintActivity(emptyGitHub);

    expect(m.totalCommits).toBe(0);
    expect(m.pullRequests.total).toBe(0);
    expect(m.pullRequests.mergeRate).toBe(0);
    expect(m.additions).toBe(0);
    expect(m.deletions).toBe(0);
    expect(m.reviews.total).toBe(0);
    expect(m.avgMergeTimeHours).toBeNull();
    expect(m.jira).toBeUndefined();
  });

  it('calculates PR merge rate correctly', () => {
    const github: GitHubActivity = {
      ...emptyGitHub,
      pullRequests: [
        {
          number: 1,
          title: 'Merged',
          state: 'merged',
          author: 'u',
          createdAt: '2026-01-20T10:00:00Z',
          updatedAt: '',
          mergedAt: '2026-01-21T10:00:00Z',
          repo: 'org/a',
          url: '',
        },
        {
          number: 2,
          title: 'Merged 2',
          state: 'merged',
          author: 'u',
          createdAt: '2026-01-22T10:00:00Z',
          updatedAt: '',
          mergedAt: '2026-01-22T14:00:00Z',
          repo: 'org/a',
          url: '',
        },
        {
          number: 3,
          title: 'Open',
          state: 'open',
          author: 'u',
          createdAt: '',
          updatedAt: '',
          repo: 'org/a',
          url: '',
        },
        {
          number: 4,
          title: 'Closed',
          state: 'closed',
          author: 'u',
          createdAt: '',
          updatedAt: '',
          repo: 'org/a',
          url: '',
        },
      ],
    };

    const m = analyzeSprintActivity(github);
    expect(m.pullRequests.total).toBe(4);
    expect(m.pullRequests.merged).toBe(2);
    expect(m.pullRequests.open).toBe(1);
    expect(m.pullRequests.closed).toBe(1);
    expect(m.pullRequests.mergeRate).toBe(50);
  });

  it('calculates average merge time from timestamps', () => {
    const github: GitHubActivity = {
      ...emptyGitHub,
      pullRequests: [
        {
          number: 1,
          title: 'PR1',
          state: 'merged',
          author: 'u',
          createdAt: '2026-01-20T00:00:00Z',
          updatedAt: '',
          mergedAt: '2026-01-21T00:00:00Z', // 24 hours
          repo: 'org/a',
          url: '',
        },
        {
          number: 2,
          title: 'PR2',
          state: 'merged',
          author: 'u',
          createdAt: '2026-01-22T00:00:00Z',
          updatedAt: '',
          mergedAt: '2026-01-23T12:00:00Z', // 36 hours
          repo: 'org/a',
          url: '',
        },
      ],
    };

    const m = analyzeSprintActivity(github);
    // Average: (24 + 36) / 2 = 30 hours
    expect(m.avgMergeTimeHours).toBe(30);
  });

  it('returns null merge time when no merged PRs have timestamps', () => {
    const github: GitHubActivity = {
      ...emptyGitHub,
      pullRequests: [
        {
          number: 1,
          title: 'Open',
          state: 'open',
          author: 'u',
          createdAt: '',
          updatedAt: '',
          repo: 'org/a',
          url: '',
        },
      ],
    };

    const m = analyzeSprintActivity(github);
    expect(m.avgMergeTimeHours).toBeNull();
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
          state: 'APPROVED',
          submittedAt: '',
          repo: 'org/a',
        },
        {
          pullRequestNumber: 3,
          pullRequestTitle: 'PR3',
          author: 'u',
          state: 'CHANGES_REQUESTED',
          submittedAt: '',
          repo: 'org/a',
        },
      ],
    };

    const m = analyzeSprintActivity(github);
    expect(m.reviews.total).toBe(3);
    expect(m.reviews.approved).toBe(2);
    expect(m.reviews.changesRequested).toBe(1);
    expect(m.reviews.commented).toBe(0);
  });

  it('handles undefined additions/deletions on PRs', () => {
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
          additions: 150,
          deletions: 30,
        },
        {
          number: 2,
          title: 'No stats',
          state: 'merged',
          author: 'u',
          createdAt: '',
          updatedAt: '',
          repo: 'org/a',
          url: '',
        },
      ],
    };

    const m = analyzeSprintActivity(github);
    expect(m.additions).toBe(150);
    expect(m.deletions).toBe(30);
  });

  it('calculates Jira completion rate', () => {
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
          status: 'Closed',
          priority: 'Low',
          assignee: 'u',
          issueType: 'Task',
          updatedAt: '',
          url: '',
        },
        {
          key: 'P-4',
          summary: 's',
          status: 'Resolved',
          priority: 'High',
          assignee: 'u',
          issueType: 'Bug',
          updatedAt: '',
          url: '',
        },
      ],
      timeRange: { from: '', to: '' },
    };

    const m = analyzeSprintActivity(emptyGitHub, jira);
    expect(m.jira).toBeDefined();
    expect(m.jira!.totalIssues).toBe(4);
    expect(m.jira!.completed).toBe(3); // Done, Closed, Resolved
    expect(m.jira!.completionRate).toBe(75);
    expect(m.jira!.byType['Bug']).toBe(2);
    expect(m.jira!.byType['Story']).toBe(1);
    expect(m.jira!.byType['Task']).toBe(1);
    expect(m.jira!.byPriority['High']).toBe(2);
  });

  it('omits Jira metrics when not provided', () => {
    const m = analyzeSprintActivity(emptyGitHub);
    expect(m.jira).toBeUndefined();
  });
});
