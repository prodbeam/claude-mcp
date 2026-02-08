/**
 * AI Report Generator
 *
 * Uses Anthropic Claude API to transform raw activity data into
 * human-readable standup reports.
 *
 * Falls back to raw data formatting if ANTHROPIC_API_KEY is not configured.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { GitHubActivity } from '../types/github.js';
import type { JiraActivity } from '../types/jira.js';
import type { WeeklyReportInput, WeeklyMetrics } from '../types/weekly.js';
import type { RetroReportInput, SprintMetrics } from '../types/retrospective.js';
import { calculateWeeklyMetrics } from './metrics-calculator.js';
import { analyzeSprintActivity } from './sprint-analyzer.js';

interface DailyReportInput {
  github: GitHubActivity;
  jira?: JiraActivity;
}

/**
 * Check if AI report generation is available
 */
export function isAIConfigured(): boolean {
  return Boolean(process.env['ANTHROPIC_API_KEY']);
}

/**
 * Generate a daily standup report using AI
 */
export async function generateDailyReport(input: DailyReportInput): Promise<string> {
  const rawSummary = buildRawSummary(input);

  if (!isAIConfigured()) {
    return buildFallbackReport(input, rawSummary);
  }

  try {
    return await generateWithAI(rawSummary, input);
  } catch (error) {
    console.error('[prodbeam] AI generation failed, using fallback:', error);
    return buildFallbackReport(input, rawSummary);
  }
}

/**
 * Build a text summary of raw activity data for the AI prompt
 */
function buildRawSummary(input: DailyReportInput): string {
  const { github, jira } = input;
  const parts: string[] = [];

  // Commits
  parts.push(`**GitHub Commits (${github.commits.length}):**`);
  if (github.commits.length > 0) {
    for (const c of github.commits) {
      parts.push(`- ${c.message} (${c.sha} in ${c.repo})`);
    }
  } else {
    parts.push('- No commits');
  }

  parts.push('');

  // Pull Requests
  parts.push(`**GitHub Pull Requests (${github.pullRequests.length}):**`);
  if (github.pullRequests.length > 0) {
    for (const pr of github.pullRequests) {
      const stats = pr.additions !== undefined ? ` (+${pr.additions}/-${pr.deletions})` : '';
      parts.push(`- #${pr.number}: ${pr.title} [${pr.state}]${stats} (${pr.repo})`);
    }
  } else {
    parts.push('- No pull requests');
  }

  parts.push('');

  // Reviews
  parts.push(`**GitHub Reviews (${github.reviews.length}):**`);
  if (github.reviews.length > 0) {
    for (const r of github.reviews) {
      parts.push(
        `- Reviewed PR #${r.pullRequestNumber}: ${r.pullRequestTitle} [${r.state}] (${r.repo})`
      );
    }
  } else {
    parts.push('- No reviews');
  }

  // Jira
  if (jira && jira.issues.length > 0) {
    parts.push('');
    parts.push(`**Jira Issues (${jira.issues.length}):**`);
    for (const issue of jira.issues) {
      parts.push(`- ${issue.key}: ${issue.summary} [${issue.status}]`);
    }
  }

  return parts.join('\n');
}

/**
 * Generate report using Anthropic Claude API
 */
async function generateWithAI(rawSummary: string, input: DailyReportInput): Promise<string> {
  const anthropic = new Anthropic();

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: `You are a concise technical writer generating daily standup reports for software developers.

Rules:
- Use bullet points, be concise
- Focus on accomplishments (what was done), not process
- Identify blockers from stale PRs (open > 2 days) or stuck tickets
- Be professional, not cheerful
- Do NOT invent work that isn't in the data
- For "Today" section, infer from open PRs and in-progress tickets
- Output only the report in Markdown, no extra commentary`,

    messages: [
      {
        role: 'user',
        content: `Generate a daily standup report for ${today} based on this activity from the last 24 hours by GitHub user "${input.github.username}":

${rawSummary}

Format:
# Daily Standup - ${today}

## Yesterday
- [accomplishments based on merged PRs, commits, completed tickets]

## Today
- [planned work based on open PRs, in-progress tickets]

## Blockers
- [any blockers, or "None" if clear]`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in AI response');
  }

  return textBlock.text;
}

/**
 * Build a structured report without AI (fallback)
 */
function buildFallbackReport(input: DailyReportInput, rawSummary: string): string {
  const { github, jira } = input;
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const parts: string[] = [];
  parts.push(`# Daily Standup - ${today}`);
  parts.push('');
  parts.push(`## GitHub Activity (Last 24 Hours) - ${github.username}`);
  parts.push('');

  // Commits
  parts.push(`### Commits: ${github.commits.length}`);
  if (github.commits.length > 0) {
    for (const c of github.commits) {
      parts.push(`- \`${c.sha}\` ${c.message} (${c.repo})`);
    }
  } else {
    parts.push('_No commits_');
  }
  parts.push('');

  // Pull Requests
  parts.push(`### Pull Requests: ${github.pullRequests.length}`);
  if (github.pullRequests.length > 0) {
    for (const pr of github.pullRequests) {
      parts.push(`- #${pr.number}: ${pr.title} [${pr.state}]`);
    }
  } else {
    parts.push('_No pull requests_');
  }
  parts.push('');

  // Reviews
  parts.push(`### Reviews: ${github.reviews.length}`);
  if (github.reviews.length > 0) {
    for (const r of github.reviews) {
      parts.push(`- PR #${r.pullRequestNumber}: ${r.pullRequestTitle} [${r.state}]`);
    }
  } else {
    parts.push('_No reviews_');
  }

  // Jira
  if (jira && jira.issues.length > 0) {
    parts.push('');
    parts.push(`### Jira Issues: ${jira.issues.length}`);
    for (const issue of jira.issues) {
      const link = issue.url ? `[${issue.key}](${issue.url})` : issue.key;
      parts.push(`- ${link}: ${issue.summary} [${issue.status}]`);
    }
  }

  parts.push('');
  parts.push('---');

  if (!isAIConfigured()) {
    parts.push('_Set ANTHROPIC_API_KEY for AI-powered standup summaries._');
  }

  // Include raw summary as debug info
  void rawSummary;

  return parts.join('\n');
}

/**
 * Generate a weekly summary report using AI
 */
export async function generateWeeklyReport(input: WeeklyReportInput): Promise<string> {
  const metrics = calculateWeeklyMetrics(input.github, input.jira);
  const rawSummary = buildWeeklyRawSummary(input, metrics);

  if (!isAIConfigured()) {
    return buildWeeklyFallbackReport(input, metrics);
  }

  try {
    return await generateWeeklyWithAI(rawSummary, input, metrics);
  } catch (error) {
    console.error('[prodbeam] AI generation failed for weekly report, using fallback:', error);
    return buildWeeklyFallbackReport(input, metrics);
  }
}

/**
 * Build a text summary of weekly activity for the AI prompt
 */
function buildWeeklyRawSummary(input: WeeklyReportInput, metrics: WeeklyMetrics): string {
  const { github, jira } = input;
  const parts: string[] = [];

  // Overview
  parts.push(`**Weekly Summary for ${github.username}**`);
  parts.push(`Period: ${github.timeRange.from} to ${github.timeRange.to}`);
  parts.push('');

  // Metrics
  parts.push(`**Metrics:**`);
  parts.push(`- Commits: ${metrics.totalCommits}`);
  parts.push(
    `- PRs: ${metrics.pullRequests.total} (${metrics.pullRequests.open} open, ${metrics.pullRequests.merged} merged, ${metrics.pullRequests.closed} closed)`
  );
  parts.push(`- Code changes: +${metrics.additions}/-${metrics.deletions}`);
  parts.push(
    `- Reviews: ${metrics.reviews.total} (${metrics.reviews.approved} approved, ${metrics.reviews.changesRequested} changes requested, ${metrics.reviews.commented} commented)`
  );
  parts.push('');

  // Repo breakdown
  if (metrics.repoBreakdown.length > 0) {
    parts.push('**Repository Activity:**');
    for (const r of metrics.repoBreakdown) {
      parts.push(
        `- ${r.repo}: ${r.commits} commits, ${r.pullRequests} PRs (${r.merged} merged), +${r.additions}/-${r.deletions}, ${r.reviews} reviews`
      );
    }
    parts.push('');
  }

  // Commits
  parts.push(`**Commits (${github.commits.length}):**`);
  if (github.commits.length > 0) {
    for (const c of github.commits) {
      parts.push(`- ${c.message} (${c.sha} in ${c.repo})`);
    }
  } else {
    parts.push('- None');
  }
  parts.push('');

  // PRs
  parts.push(`**Pull Requests (${github.pullRequests.length}):**`);
  if (github.pullRequests.length > 0) {
    for (const pr of github.pullRequests) {
      const stats = pr.additions !== undefined ? ` (+${pr.additions}/-${pr.deletions})` : '';
      parts.push(`- #${pr.number}: ${pr.title} [${pr.state}]${stats} (${pr.repo})`);
    }
  } else {
    parts.push('- None');
  }
  parts.push('');

  // Reviews
  parts.push(`**Reviews (${github.reviews.length}):**`);
  if (github.reviews.length > 0) {
    for (const r of github.reviews) {
      parts.push(`- PR #${r.pullRequestNumber}: ${r.pullRequestTitle} [${r.state}] (${r.repo})`);
    }
  } else {
    parts.push('- None');
  }

  // Jira
  if (jira && jira.issues.length > 0 && metrics.jira) {
    parts.push('');
    parts.push(`**Jira Issues (${metrics.jira.totalIssues}):**`);
    parts.push(
      `- By status: ${Object.entries(metrics.jira.byStatus)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')}`
    );
    parts.push(
      `- By priority: ${Object.entries(metrics.jira.byPriority)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')}`
    );
    for (const issue of jira.issues) {
      parts.push(`- ${issue.key}: ${issue.summary} [${issue.status}] (${issue.priority})`);
    }
  }

  return parts.join('\n');
}

/**
 * Generate weekly report using Anthropic Claude API
 */
async function generateWeeklyWithAI(
  rawSummary: string,
  input: WeeklyReportInput,
  _metrics: WeeklyMetrics
): Promise<string> {
  const anthropic = new Anthropic();

  const endDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2500,
    system: `You are a concise technical writer generating weekly engineering summary reports.

Rules:
- Highlight significant achievements and milestones
- Include a formatted metrics table for quick scanning
- Break down activity by repository
- Identify concerns: stale PRs, high churn, review bottlenecks
- Be professional and data-driven
- Do NOT invent work that isn't in the data
- Output only the report in Markdown, no extra commentary`,

    messages: [
      {
        role: 'user',
        content: `Generate a weekly engineering summary report ending ${endDate} for GitHub user "${input.github.username}":

${rawSummary}

Format:
# Weekly Engineering Summary

## Highlights
- [top 3-5 achievements from merged PRs, significant commits]

## Metrics
| Metric | Count |
|--------|-------|
| Commits | ... |
| Pull Requests | ... |
| Code Changes | +.../-... |
| Reviews | ... |

## Repository Activity
[per-repo narrative with key changes]

## Concerns
- [any blockers, stale PRs, or risks — or "None"]`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in AI response');
  }

  return textBlock.text;
}

/**
 * Build a structured weekly report without AI (fallback)
 */
function buildWeeklyFallbackReport(input: WeeklyReportInput, metrics: WeeklyMetrics): string {
  const { github, jira } = input;
  const endDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const parts: string[] = [];
  parts.push(`# Weekly Engineering Summary - ${endDate}`);
  parts.push('');
  parts.push(`## GitHub Activity (Last 7 Days) - ${github.username}`);
  parts.push('');

  // Metrics table
  parts.push('### Metrics');
  parts.push('');
  parts.push('| Metric | Count |');
  parts.push('|--------|-------|');
  parts.push(`| Commits | ${metrics.totalCommits} |`);
  parts.push(
    `| Pull Requests | ${metrics.pullRequests.total} (${metrics.pullRequests.open} open, ${metrics.pullRequests.merged} merged, ${metrics.pullRequests.closed} closed) |`
  );
  parts.push(`| Code Changes | +${metrics.additions}/-${metrics.deletions} |`);
  parts.push(
    `| Reviews | ${metrics.reviews.total} (${metrics.reviews.approved} approved, ${metrics.reviews.changesRequested} changes requested) |`
  );
  parts.push('');

  // Repo breakdown table
  if (metrics.repoBreakdown.length > 0) {
    parts.push('### Repository Breakdown');
    parts.push('');
    parts.push('| Repository | Commits | PRs | Merged | +/- | Reviews |');
    parts.push('|------------|---------|-----|--------|-----|---------|');
    for (const r of metrics.repoBreakdown) {
      parts.push(
        `| ${r.repo} | ${r.commits} | ${r.pullRequests} | ${r.merged} | +${r.additions}/-${r.deletions} | ${r.reviews} |`
      );
    }
    parts.push('');
  }

  // Commits
  parts.push(`### Commits: ${github.commits.length}`);
  if (github.commits.length > 0) {
    for (const c of github.commits) {
      parts.push(`- \`${c.sha}\` ${c.message} (${c.repo})`);
    }
  } else {
    parts.push('_No commits_');
  }
  parts.push('');

  // PRs
  parts.push(`### Pull Requests: ${github.pullRequests.length}`);
  if (github.pullRequests.length > 0) {
    for (const pr of github.pullRequests) {
      const stats = pr.additions !== undefined ? ` (+${pr.additions}/-${pr.deletions})` : '';
      parts.push(`- #${pr.number}: ${pr.title} [${pr.state}]${stats}`);
    }
  } else {
    parts.push('_No pull requests_');
  }
  parts.push('');

  // Reviews
  parts.push(`### Reviews: ${github.reviews.length}`);
  if (github.reviews.length > 0) {
    for (const r of github.reviews) {
      parts.push(`- PR #${r.pullRequestNumber}: ${r.pullRequestTitle} [${r.state}]`);
    }
  } else {
    parts.push('_No reviews_');
  }

  // Jira
  if (jira && jira.issues.length > 0 && metrics.jira) {
    parts.push('');
    parts.push(`### Jira Issues: ${metrics.jira.totalIssues}`);
    parts.push('');
    parts.push('| Status | Count |');
    parts.push('|--------|-------|');
    for (const [status, count] of Object.entries(metrics.jira.byStatus)) {
      parts.push(`| ${status} | ${count} |`);
    }
    parts.push('');
    for (const issue of jira.issues) {
      const link = issue.url ? `[${issue.key}](${issue.url})` : issue.key;
      parts.push(`- ${link}: ${issue.summary} [${issue.status}]`);
    }
  }

  parts.push('');
  parts.push('---');

  if (!isAIConfigured()) {
    parts.push('_Set ANTHROPIC_API_KEY for AI-powered weekly summaries._');
  }

  return parts.join('\n');
}

/**
 * Generate a sprint retrospective report using AI
 */
export async function generateRetrospective(input: RetroReportInput): Promise<string> {
  const metrics = analyzeSprintActivity(input.github, input.jira);
  const rawSummary = buildRetroRawSummary(input, metrics);

  if (!isAIConfigured()) {
    return buildRetroFallbackReport(input, metrics);
  }

  try {
    return await generateRetroWithAI(rawSummary, input, metrics);
  } catch (error) {
    console.error('[prodbeam] AI generation failed for retrospective, using fallback:', error);
    return buildRetroFallbackReport(input, metrics);
  }
}

/**
 * Build a text summary of sprint activity for the AI prompt
 */
function buildRetroRawSummary(input: RetroReportInput, metrics: SprintMetrics): string {
  const { github, jira, sprintName, dateRange } = input;
  const parts: string[] = [];

  parts.push(`**Sprint Retrospective Data: ${sprintName}**`);
  parts.push(`Period: ${dateRange.from} to ${dateRange.to}`);
  parts.push(`Developer: ${github.username}`);
  parts.push('');

  // Sprint metrics
  parts.push('**Sprint Metrics:**');
  parts.push(`- Commits: ${metrics.totalCommits}`);
  parts.push(
    `- PRs: ${metrics.pullRequests.total} total, ${metrics.pullRequests.merged} merged (${metrics.pullRequests.mergeRate}% merge rate)`
  );
  parts.push(`- Code changes: +${metrics.additions}/-${metrics.deletions}`);
  parts.push(
    `- Reviews: ${metrics.reviews.total} (${metrics.reviews.approved} approved, ${metrics.reviews.changesRequested} changes requested)`
  );
  if (metrics.avgMergeTimeHours !== null) {
    parts.push(`- Average PR merge time: ${metrics.avgMergeTimeHours} hours`);
  }
  parts.push('');

  // Jira completion
  if (metrics.jira) {
    parts.push('**Jira Sprint Progress:**');
    parts.push(
      `- ${metrics.jira.completed}/${metrics.jira.totalIssues} issues completed (${metrics.jira.completionRate}%)`
    );
    parts.push(
      `- By type: ${Object.entries(metrics.jira.byType)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')}`
    );
    parts.push(
      `- By priority: ${Object.entries(metrics.jira.byPriority)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')}`
    );
    parts.push('');
  }

  // Activity details
  parts.push(`**Commits (${github.commits.length}):**`);
  if (github.commits.length > 0) {
    for (const c of github.commits) {
      parts.push(`- ${c.message} (${c.sha} in ${c.repo})`);
    }
  } else {
    parts.push('- None');
  }
  parts.push('');

  parts.push(`**Pull Requests (${github.pullRequests.length}):**`);
  if (github.pullRequests.length > 0) {
    for (const pr of github.pullRequests) {
      const stats = pr.additions !== undefined ? ` (+${pr.additions}/-${pr.deletions})` : '';
      parts.push(`- #${pr.number}: ${pr.title} [${pr.state}]${stats} (${pr.repo})`);
    }
  } else {
    parts.push('- None');
  }
  parts.push('');

  parts.push(`**Reviews (${github.reviews.length}):**`);
  if (github.reviews.length > 0) {
    for (const r of github.reviews) {
      parts.push(`- PR #${r.pullRequestNumber}: ${r.pullRequestTitle} [${r.state}] (${r.repo})`);
    }
  } else {
    parts.push('- None');
  }

  if (jira && jira.issues.length > 0) {
    parts.push('');
    parts.push(`**Jira Issues (${jira.issues.length}):**`);
    for (const issue of jira.issues) {
      parts.push(
        `- ${issue.key}: ${issue.summary} [${issue.status}] (${issue.priority}, ${issue.issueType})`
      );
    }
  }

  return parts.join('\n');
}

/**
 * Generate retrospective using Anthropic Claude API
 */
async function generateRetroWithAI(
  rawSummary: string,
  input: RetroReportInput,
  metrics: SprintMetrics
): Promise<string> {
  const anthropic = new Anthropic();

  const completionContext = metrics.jira
    ? `Sprint completion rate: ${metrics.jira.completionRate}% (${metrics.jira.completed}/${metrics.jira.totalIssues} issues).`
    : 'No Jira data available for completion tracking.';

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    system: `You are an experienced Scrum Master generating sprint retrospective reports.

Rules:
- Analyze the data objectively — identify patterns, not just list items
- "What went well" should highlight achievements with supporting metrics
- "What could improve" should identify bottlenecks from the data (slow merge times, low completion rate, stale PRs)
- "Action items" should be specific, measurable, and achievable
- Be professional and constructive — no blame, focus on process improvement
- Do NOT invent work or issues that aren't in the data
- Output only the report in Markdown, no extra commentary`,

    messages: [
      {
        role: 'user',
        content: `Generate a sprint retrospective for "${input.sprintName}" (${input.dateRange.from} to ${input.dateRange.to}) for developer "${input.github.username}".

${completionContext}

${rawSummary}

Format:
# Sprint Retrospective: ${input.sprintName}

## Sprint Summary
[2-3 sentence overview of the sprint with key metrics]

## What Went Well
- [achievements backed by data]

## What Could Improve
- [issues identified from metrics and patterns]

## Action Items
- [ ] [specific, measurable improvement actions]

## Metrics
| Metric | Value |
|--------|-------|
| ... | ... |`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in AI response');
  }

  return textBlock.text;
}

/**
 * Build a structured retrospective report without AI (fallback)
 */
function buildRetroFallbackReport(input: RetroReportInput, metrics: SprintMetrics): string {
  const { github, jira, sprintName, dateRange } = input;
  const parts: string[] = [];

  parts.push(`# Sprint Retrospective: ${sprintName}`);
  parts.push('');
  parts.push(`**Period:** ${dateRange.from} to ${dateRange.to}`);
  parts.push(`**Developer:** ${github.username}`);
  parts.push('');

  // Metrics table
  parts.push('## Sprint Metrics');
  parts.push('');
  parts.push('| Metric | Value |');
  parts.push('|--------|-------|');
  parts.push(`| Commits | ${metrics.totalCommits} |`);
  parts.push(
    `| Pull Requests | ${metrics.pullRequests.total} (${metrics.pullRequests.merged} merged, ${metrics.pullRequests.open} open, ${metrics.pullRequests.closed} closed) |`
  );
  parts.push(`| Merge Rate | ${metrics.pullRequests.mergeRate}% |`);
  if (metrics.avgMergeTimeHours !== null) {
    parts.push(`| Avg Merge Time | ${metrics.avgMergeTimeHours} hours |`);
  }
  parts.push(`| Code Changes | +${metrics.additions}/-${metrics.deletions} |`);
  parts.push(
    `| Reviews | ${metrics.reviews.total} (${metrics.reviews.approved} approved, ${metrics.reviews.changesRequested} changes requested) |`
  );

  if (metrics.jira) {
    parts.push(
      `| Jira Completion | ${metrics.jira.completed}/${metrics.jira.totalIssues} (${metrics.jira.completionRate}%) |`
    );
  }
  parts.push('');

  // Jira breakdown
  if (metrics.jira && jira && jira.issues.length > 0) {
    parts.push('## Jira Issues');
    parts.push('');
    parts.push('| Type | Count |');
    parts.push('|------|-------|');
    for (const [type, count] of Object.entries(metrics.jira.byType)) {
      parts.push(`| ${type} | ${count} |`);
    }
    parts.push('');
    for (const issue of jira.issues) {
      const link = issue.url ? `[${issue.key}](${issue.url})` : issue.key;
      parts.push(`- ${link}: ${issue.summary} [${issue.status}]`);
    }
    parts.push('');
  }

  // Commits
  parts.push(`## Commits: ${github.commits.length}`);
  if (github.commits.length > 0) {
    for (const c of github.commits) {
      parts.push(`- \`${c.sha}\` ${c.message} (${c.repo})`);
    }
  } else {
    parts.push('_No commits_');
  }
  parts.push('');

  // PRs
  parts.push(`## Pull Requests: ${github.pullRequests.length}`);
  if (github.pullRequests.length > 0) {
    for (const pr of github.pullRequests) {
      const stats = pr.additions !== undefined ? ` (+${pr.additions}/-${pr.deletions})` : '';
      parts.push(`- #${pr.number}: ${pr.title} [${pr.state}]${stats}`);
    }
  } else {
    parts.push('_No pull requests_');
  }
  parts.push('');

  // Reviews
  parts.push(`## Reviews: ${github.reviews.length}`);
  if (github.reviews.length > 0) {
    for (const r of github.reviews) {
      parts.push(`- PR #${r.pullRequestNumber}: ${r.pullRequestTitle} [${r.state}]`);
    }
  } else {
    parts.push('_No reviews_');
  }

  parts.push('');
  parts.push('---');

  if (!isAIConfigured()) {
    parts.push(
      '_Set ANTHROPIC_API_KEY for AI-powered retrospective analysis with "What Went Well", "What Could Improve", and "Action Items"._'
    );
  }

  return parts.join('\n');
}
