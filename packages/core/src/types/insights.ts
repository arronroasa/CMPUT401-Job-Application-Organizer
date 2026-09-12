export interface ApplicationDataPoint {
  date: string;
  count: number;
}

export interface InterviewRateDataPoint {
  date: string;
  rate: number;
}

export interface MatchDistributionDataPoint {
  tier: string;
  count: number;
  color: string;
}

export interface InsightsMetrics {
  totalApplications: number;
  responseRate: number;       // 0-100 percentage
  interviewRate: number;      // 0-100 percentage
  offerRate: number;
  bestResumeVersionId: string;
  bestResumeVersionLabel: string;
  topMissingSkill: string;
  applicationsOverTime: ApplicationDataPoint[];
  interviewRateOverTime: InterviewRateDataPoint[];
  matchDistribution: MatchDistributionDataPoint[];
  windowDays: number;
  mockSessionsCount?: number;
  averageMockScore?: number;
}
