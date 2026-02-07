import { describe, it, expect } from 'vitest';
import {
  isAIConfigured,
  generateDailyReport,
  generateWeeklyReport,
  generateRetrospective,
} from './report-generator.js';
import type { GitHubActivity } from '../types/github.js';

describe('report-generator', () => {
  describe('isAIConfigured', () => {
    it('returns false when ANTHROPIC_API_KEY is not set', () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];

      expect(isAIConfigured()).toBe(false);

      if (original) process.env['ANTHROPIC_API_KEY'] = original;
    });

    it('returns true when ANTHROPIC_API_KEY is set', () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';

      expect(isAIConfigured()).toBe(true);

      if (original) {
        process.env['ANTHROPIC_API_KEY'] = original;
      } else {
        delete process.env['ANTHROPIC_API_KEY'];
      }
    });
  });

  describe('generateDailyReport', () => {
    it('generates a fallback report without AI key', async () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];

      const githubActivity: GitHubActivity = {
        username: 'testuser',
        commits: [
          {
            sha: 'abc1234',
            message: 'fix: resolve login bug',
            author: 'testuser',
            date: '2026-02-07T10:00:00Z',
            repo: 'org/repo',
            url: 'https://github.com/org/repo/commit/abc1234',
          },
        ],
        pullRequests: [
          {
            number: 42,
            title: 'Fix login redirect',
            state: 'merged',
            author: 'testuser',
            createdAt: '2026-02-06T09:00:00Z',
            updatedAt: '2026-02-07T10:00:00Z',
            mergedAt: '2026-02-07T10:00:00Z',
            repo: 'org/repo',
            url: 'https://github.com/org/repo/pull/42',
          },
        ],
        reviews: [],
        timeRange: {
          from: '2026-02-06T10:00:00Z',
          to: '2026-02-07T10:00:00Z',
        },
      };

      const report = await generateDailyReport({ github: githubActivity });

      expect(report).toContain('Daily Standup');
      expect(report).toContain('testuser');
      expect(report).toContain('Commits: 1');
      expect(report).toContain('fix: resolve login bug');
      expect(report).toContain('#42');
      expect(report).toContain('Fix login redirect');
      expect(report).toContain('merged');
      expect(report).toContain('ANTHROPIC_API_KEY');

      if (original) process.env['ANTHROPIC_API_KEY'] = original;
    });

    it('handles empty activity gracefully', async () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];

      const emptyActivity: GitHubActivity = {
        username: 'testuser',
        commits: [],
        pullRequests: [],
        reviews: [],
        timeRange: {
          from: '2026-02-06T10:00:00Z',
          to: '2026-02-07T10:00:00Z',
        },
      };

      const report = await generateDailyReport({ github: emptyActivity });

      expect(report).toContain('Daily Standup');
      expect(report).toContain('Commits: 0');
      expect(report).toContain('No commits');
      expect(report).toContain('No pull requests');
      expect(report).toContain('No reviews');

      if (original) process.env['ANTHROPIC_API_KEY'] = original;
    });

    it('includes Jira activity when provided', async () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];

      const report = await generateDailyReport({
        github: {
          username: 'testuser',
          commits: [],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
        jira: {
          issues: [
            {
              key: 'PROJ-123',
              summary: 'Fix authentication flow',
              status: 'Done',
              priority: 'High',
              assignee: 'testuser',
              issueType: 'Bug',
              updatedAt: '2026-02-07T10:00:00Z',
              url: 'https://company.atlassian.net/browse/PROJ-123',
            },
          ],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('PROJ-123');
      expect(report).toContain('Fix authentication flow');
      expect(report).toContain('Done');

      if (original) process.env['ANTHROPIC_API_KEY'] = original;
    });
  });

  describe('generateWeeklyReport', () => {
    it('generates a fallback weekly report without AI key', async () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];

      const github: GitHubActivity = {
        username: 'testuser',
        commits: [
          {
            sha: 'abc1234',
            message: 'feat: add auth',
            author: 'testuser',
            date: '',
            repo: 'org/app',
            url: '',
          },
          {
            sha: 'def5678',
            message: 'fix: login bug',
            author: 'testuser',
            date: '',
            repo: 'org/app',
            url: '',
          },
        ],
        pullRequests: [
          {
            number: 10,
            title: 'Add auth feature',
            state: 'merged',
            author: 'testuser',
            createdAt: '',
            updatedAt: '',
            mergedAt: '',
            repo: 'org/app',
            url: '',
            additions: 200,
            deletions: 50,
          },
        ],
        reviews: [
          {
            pullRequestNumber: 5,
            pullRequestTitle: 'Refactor DB',
            author: 'testuser',
            state: 'APPROVED',
            submittedAt: '',
            repo: 'org/lib',
          },
        ],
        timeRange: { from: '2026-02-01T00:00:00Z', to: '2026-02-07T00:00:00Z' },
      };

      const report = await generateWeeklyReport({ github });

      expect(report).toContain('Weekly Engineering Summary');
      expect(report).toContain('testuser');
      expect(report).toContain('Commits | 2');
      expect(report).toContain('Pull Requests | 1');
      expect(report).toContain('+200/-50');
      expect(report).toContain('ANTHROPIC_API_KEY');

      if (original) {
        process.env['ANTHROPIC_API_KEY'] = original;
      }
    });

    it('handles empty activity gracefully', async () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];

      const report = await generateWeeklyReport({
        github: {
          username: 'testuser',
          commits: [],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('Weekly Engineering Summary');
      expect(report).toContain('Commits | 0');
      expect(report).toContain('No commits');
      expect(report).toContain('No pull requests');
      expect(report).toContain('No reviews');

      if (original) {
        process.env['ANTHROPIC_API_KEY'] = original;
      }
    });

    it('includes Jira metrics when provided', async () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];

      const report = await generateWeeklyReport({
        github: {
          username: 'testuser',
          commits: [],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
        jira: {
          issues: [
            {
              key: 'PROJ-1',
              summary: 'Fix auth',
              status: 'Done',
              priority: 'High',
              assignee: 'u',
              issueType: 'Bug',
              updatedAt: '',
              url: '',
            },
            {
              key: 'PROJ-2',
              summary: 'Add feature',
              status: 'In Progress',
              priority: 'Medium',
              assignee: 'u',
              issueType: 'Story',
              updatedAt: '',
              url: '',
            },
          ],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('Jira Issues: 2');
      expect(report).toContain('Done');
      expect(report).toContain('In Progress');
      expect(report).toContain('PROJ-1');
      expect(report).toContain('PROJ-2');

      if (original) {
        process.env['ANTHROPIC_API_KEY'] = original;
      }
    });

    it('includes repo breakdown table', async () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];

      const report = await generateWeeklyReport({
        github: {
          username: 'testuser',
          commits: [
            { sha: 'a', message: 'c1', author: 'u', date: '', repo: 'org/frontend', url: '' },
            { sha: 'b', message: 'c2', author: 'u', date: '', repo: 'org/backend', url: '' },
          ],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('Repository Breakdown');
      expect(report).toContain('org/frontend');
      expect(report).toContain('org/backend');

      if (original) {
        process.env['ANTHROPIC_API_KEY'] = original;
      }
    });
  });

  describe('generateRetrospective', () => {
    it('generates a fallback retrospective without AI key', async () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];

      const report = await generateRetrospective({
        sprintName: 'Sprint 42',
        dateRange: { from: '2026-01-20', to: '2026-02-03' },
        github: {
          username: 'testuser',
          commits: [
            {
              sha: 'abc',
              message: 'feat: new feature',
              author: 'testuser',
              date: '',
              repo: 'org/app',
              url: '',
            },
          ],
          pullRequests: [
            {
              number: 10,
              title: 'Add feature',
              state: 'merged',
              author: 'testuser',
              createdAt: '2026-01-20T10:00:00Z',
              updatedAt: '',
              mergedAt: '2026-01-21T10:00:00Z',
              repo: 'org/app',
              url: '',
              additions: 100,
              deletions: 20,
            },
          ],
          reviews: [],
          timeRange: { from: '2026-01-20', to: '2026-02-03' },
        },
      });

      expect(report).toContain('Sprint Retrospective: Sprint 42');
      expect(report).toContain('2026-01-20');
      expect(report).toContain('2026-02-03');
      expect(report).toContain('testuser');
      expect(report).toContain('Merge Rate | 100%');
      expect(report).toContain('Commits | 1');
      expect(report).toContain('ANTHROPIC_API_KEY');

      if (original) {
        process.env['ANTHROPIC_API_KEY'] = original;
      }
    });

    it('handles empty activity gracefully', async () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];

      const report = await generateRetrospective({
        sprintName: 'Sprint 1',
        dateRange: { from: '2026-01-01', to: '2026-01-14' },
        github: {
          username: 'testuser',
          commits: [],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('Sprint Retrospective: Sprint 1');
      expect(report).toContain('Commits | 0');
      expect(report).toContain('No commits');
      expect(report).toContain('No pull requests');
      expect(report).toContain('No reviews');

      if (original) {
        process.env['ANTHROPIC_API_KEY'] = original;
      }
    });

    it('includes Jira completion metrics when provided', async () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];

      const report = await generateRetrospective({
        sprintName: 'Sprint 5',
        dateRange: { from: '2026-01-20', to: '2026-02-03' },
        github: {
          username: 'testuser',
          commits: [],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
        jira: {
          issues: [
            {
              key: 'P-1',
              summary: 'Task 1',
              status: 'Done',
              priority: 'High',
              assignee: 'u',
              issueType: 'Story',
              updatedAt: '',
              url: '',
            },
            {
              key: 'P-2',
              summary: 'Task 2',
              status: 'In Progress',
              priority: 'Medium',
              assignee: 'u',
              issueType: 'Bug',
              updatedAt: '',
              url: '',
            },
          ],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('Jira Completion');
      expect(report).toContain('1/2');
      expect(report).toContain('50%');
      expect(report).toContain('P-1');
      expect(report).toContain('P-2');

      if (original) {
        process.env['ANTHROPIC_API_KEY'] = original;
      }
    });

    it('displays sprint name correctly', async () => {
      const original = process.env['ANTHROPIC_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];

      const report = await generateRetrospective({
        sprintName: 'Q1 Sprint 3',
        dateRange: { from: '2026-02-01', to: '2026-02-14' },
        github: {
          username: 'dev',
          commits: [],
          pullRequests: [],
          reviews: [],
          timeRange: { from: '', to: '' },
        },
      });

      expect(report).toContain('Q1 Sprint 3');

      if (original) {
        process.env['ANTHROPIC_API_KEY'] = original;
      }
    });
  });
});
