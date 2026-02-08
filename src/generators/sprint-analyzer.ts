/**
 * Sprint Analyzer
 *
 * Pure functions to compute sprint-level metrics for retrospectives.
 * No I/O — all data passed in, results returned.
 */

import type { GitHubActivity } from '../types/github.js';
import type { JiraActivity } from '../types/jira.js';
import type { SprintMetrics } from '../types/retrospective.js';

const DONE_STATUSES = ['done', 'closed', 'resolved', 'complete', 'completed'];

/**
 * Analyze sprint activity and compute retrospective metrics
 */
export function analyzeSprintActivity(github: GitHubActivity, jira?: JiraActivity): SprintMetrics {
  // PR stats
  let prMerged = 0;
  let prOpen = 0;
  let prClosed = 0;
  let totalAdditions = 0;
  let totalDeletions = 0;

  // Merge time tracking
  let totalMergeTimeMs = 0;
  let mergedWithTimestamps = 0;

  for (const pr of github.pullRequests) {
    if (pr.state === 'merged') {
      prMerged++;
      if (pr.createdAt && pr.mergedAt) {
        const created = new Date(pr.createdAt).getTime();
        const merged = new Date(pr.mergedAt).getTime();
        if (!isNaN(created) && !isNaN(merged) && merged > created) {
          totalMergeTimeMs += merged - created;
          mergedWithTimestamps++;
        }
      }
    } else if (pr.state === 'open') {
      prOpen++;
    } else {
      prClosed++;
    }

    totalAdditions += pr.additions ?? 0;
    totalDeletions += pr.deletions ?? 0;
  }

  const prTotal = github.pullRequests.length;
  const mergeRate = prTotal > 0 ? Math.round((prMerged / prTotal) * 100) : 0;

  // Average merge time in hours
  const avgMergeTimeHours =
    mergedWithTimestamps > 0
      ? Math.round((totalMergeTimeMs / mergedWithTimestamps / (1000 * 60 * 60)) * 10) / 10
      : null;

  // Review stats
  let approved = 0;
  let changesRequested = 0;
  let commented = 0;

  for (const rev of github.reviews) {
    if (rev.state === 'APPROVED') approved++;
    else if (rev.state === 'CHANGES_REQUESTED') changesRequested++;
    else commented++;
  }

  const metrics: SprintMetrics = {
    totalCommits: github.commits.length,
    pullRequests: {
      total: prTotal,
      merged: prMerged,
      open: prOpen,
      closed: prClosed,
      mergeRate,
    },
    additions: totalAdditions,
    deletions: totalDeletions,
    reviews: {
      total: github.reviews.length,
      approved,
      changesRequested,
      commented,
    },
    avgMergeTimeHours,
  };

  if (jira && jira.issues.length > 0) {
    const byType: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let completed = 0;

    for (const issue of jira.issues) {
      byType[issue.issueType] = (byType[issue.issueType] ?? 0) + 1;
      byPriority[issue.priority] = (byPriority[issue.priority] ?? 0) + 1;

      if (DONE_STATUSES.includes(issue.status.toLowerCase())) {
        completed++;
      }
    }

    const totalIssues = jira.issues.length;
    metrics.jira = {
      totalIssues,
      completed,
      completionRate: Math.round((completed / totalIssues) * 100),
      byType,
      byPriority,
    };
  }

  return metrics;
}
