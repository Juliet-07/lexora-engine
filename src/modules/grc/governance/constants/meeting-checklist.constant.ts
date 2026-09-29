// The meeting preparation checklist — a fixed, well-known 10-item
// governance checklist (properly-convened / notice / agenda / prior
// minutes / resolutions / quorum / conflicts / papers / statutory /
// post-meeting actions), matching the PO's own reference prototype
// (MeetingPreparation.tsx) item-for-item so an itemId here always
// resolves to the same title the tenant frontend already renders.
// Completing all 10 is what gates the Dispatch button — see
// MeetingService#dispatch.
export interface MeetingChecklistItemDef {
  id: string;
  title: string;
  detail: string;
}

export const MEETING_CHECKLIST_ITEMS: MeetingChecklistItemDef[] = [
  {
    id: 'convened',
    title: 'Meeting properly convened',
    detail:
      'Confirm the meeting has been called in line with the constitution/charter.',
  },
  {
    id: 'notice-issued',
    title: 'Required notice issued on time',
    detail: 'The notice period for this meeting type has been met.',
  },
  {
    id: 'agenda-complete',
    title: 'Agenda complete',
    detail: 'All agenda items and presenters are confirmed.',
  },
  {
    id: 'minutes-reviewed',
    title: 'Previous minutes and outstanding actions reviewed',
    detail: 'Prior minutes are accurate and open actions are tracked.',
  },
  {
    id: 'resolutions-prepared',
    title: 'Draft resolutions prepared',
    detail: 'Any resolutions expected at this meeting are drafted.',
  },
  {
    id: 'quorum-confirmed',
    title: 'Quorum confirmed',
    detail: 'Expected attendance meets the quorum requirement.',
  },
  {
    id: 'coi-checked',
    title: 'Conflicts of interest checked',
    detail: 'Known conflicts for this agenda have been identified.',
  },
  {
    id: 'papers-circulated',
    title: 'Board papers reviewed and circulated',
    detail: 'Supporting papers are final and ready to circulate.',
  },
  {
    id: 'statutory-checked',
    title: 'Statutory and governance requirements checked',
    detail:
      'Any statutory filings or governance steps tied to this meeting are accounted for.',
  },
  {
    id: 'actions-identified',
    title: 'Post-meeting actions identified',
    detail: 'Likely follow-up actions have been anticipated.',
  },
];

export const MEETING_CHECKLIST_ITEM_IDS = MEETING_CHECKLIST_ITEMS.map(
  (i) => i.id,
);
