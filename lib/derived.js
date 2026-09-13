import { STAGES } from './constants';

// Stages whose arrival is worth telling the user about.
const NOTIFY_STAGES = ['interview', 'offer'];

function stageRank(id) {
  return STAGES.findIndex((s) => s.id === id);
}

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

/**
 * Applications grouped by the day their next action falls on.
 *
 * Completed actions stay in the map: the week strip shows them struck through
 * so a day you have worked through does not read as an empty day.
 */
export function nextActionsByDay(applications) {
  const map = {};
  for (const a of applications) {
    if (!a.nextAction || !a.nextAction.date) continue;
    const key = a.nextAction.date.slice(0, 10);
    (map[key] ||= []).push(a);
  }
  return map;
}

export function recentActivity(applications, limit = 5) {
  const events = [];
  applications.forEach((a) => {
    (a.timeline || []).forEach((t) => events.push({ ...t, company: a.company, role: a.role, appId: a.id }));
  });
  return events.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);
}

/**
 * Every time an application moved forward into interview or offer.
 *
 * Read out of each application's own timeline rather than stored alongside it,
 * so there is nothing to keep in sync. Walking the timeline in order lets us
 * tell a forward arrival from a slide back: interview -> screening -> interview
 * is two separate pieces of news, but offer -> interview is none.
 */
export function notifications(applications) {
  const items = [];
  applications.forEach((a) => {
    let prevRank = -1;
    (a.timeline || []).forEach((t) => {
      const rank = stageRank(t.stage);
      const movedForward = rank > prevRank;
      prevRank = rank;
      if (!movedForward || !NOTIFY_STAGES.includes(t.stage)) return;
      items.push({
        id: t.id,
        appId: a.id,
        company: a.company,
        role: a.role,
        stage: t.stage,
        date: t.date,
      });
    });
  });
  return items.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function unreadNotifications(items, readIds) {
  const read = new Set(readIds || []);
  return items.filter((n) => !read.has(n.id));
}

// Applications naming a resume version as the resume they were sent with —
// see CONTEXT.md's "Where it's been sent".
export function sentCount(resumeId, applications) {
  return applications.filter((a) => a.resumeVersionId === resumeId).length;
}
