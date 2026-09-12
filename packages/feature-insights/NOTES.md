# Feature: Insights
## Status: Scaffolded

## What's Done
- InsightsPage with 5 MetricCards and 3 Recharts charts
- MetricCard component with optional highlight variant
- ApplicationsOverTimeChart: dark-mode BarChart
- InterviewRateChart: dark-mode LineChart
- MatchDistributionChart: dark-mode PieChart with tier colors
- Zustand store (useInsightsStore) with fetchInsights

## Next Steps
- Add 30d/90d/all-time window toggle
- Drill-down: clicking "Best Resume" card navigates to /resume-studio?id=...
- Connect to real analytics endpoint (aggregate from applications data)
- Add resume version performance comparison table
- Add "Top Missing Skill" recommendation with learning resource links (stub)

## Dependencies
- @onfile/core (InsightsMetrics, ApplicationDataPoint, etc.)
- @onfile/ui (PageHeader, cn)
- @onfile/api (getInsights)
- recharts
