type ReportEmailProfile = {
  status: 'active' | 'deleted';
  email?: string;
  emailVerified?: boolean;
};

type EligibleReportEmailProfile = ReportEmailProfile & {
  status: 'active';
  email: string;
  emailVerified: true;
};

export function isMonthlyReportEmailEligible(
  profile: ReportEmailProfile | null,
): profile is EligibleReportEmailProfile {
  return Boolean(
    profile &&
    profile.status === 'active' &&
    profile.email?.trim().length &&
    profile.emailVerified === true,
  );
}
