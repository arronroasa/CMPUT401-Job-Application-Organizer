export const STAGES = [
  { id: 'applied', label: 'Applied', text: 'text-stageApplied', bg: 'bg-stageAppliedSoft', dot: 'bg-stageApplied' },
  { id: 'screening', label: 'Screening', text: 'text-stageScreening', bg: 'bg-stageScreeningSoft', dot: 'bg-stageScreening' },
  { id: 'interview', label: 'Interview', text: 'text-stageInterview', bg: 'bg-stageInterviewSoft', dot: 'bg-stageInterview' },
  { id: 'offer', label: 'Offer', text: 'text-stageOffer', bg: 'bg-stageOfferSoft', dot: 'bg-stageOffer' },
  { id: 'closed', label: 'Closed', text: 'text-stageClosed', bg: 'bg-stageClosedSoft', dot: 'bg-stageClosed' },
];

export function stageMeta(id) {
  return STAGES.find((s) => s.id === id) || STAGES[0];
}

export const COMM_TYPES = ['Email', 'Call', 'Interview', 'Other'];
