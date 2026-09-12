export function stats(applications) {
  const total = applications.length;
  const inProgress = applications.filter((a) => a.stage === 'screening' || a.stage === 'interview').length;
  const awaitingReply = applications.filter((a) => a.stage === 'applied' || a.stage === 'screening').length;
  const offers = applications.filter((a) => a.stage === 'offer').length;
  return { total, inProgress, awaitingReply, offers };
}

export function dueToday(applications) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return applications
    .filter((a) => a.nextAction && a.nextAction.date && !a.nextAction.done && new Date(a.nextAction.date) <= now)
    .sort((a, b) => new Date(a.nextAction.date) - new Date(b.nextAction.date));
}

export function recentActivity(applications, limit = 5) {
  const events = [];
  applications.forEach((a) => {
    (a.timeline || []).forEach((t) => events.push({ ...t, company: a.company, role: a.role, appId: a.id }));
  });
  return events.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);
}
