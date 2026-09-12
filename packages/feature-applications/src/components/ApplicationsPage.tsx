import { useEffect, useState } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { ApplicationDraft, ApplicationStatus } from '@onfile/core';
import { PageHeader } from '@onfile/ui';
import { useApplicationsStore } from '../state/useApplicationsStore';
import { KanbanColumn } from './KanbanColumn';
import { ApplicationDetailModal } from './ApplicationDetailModal';

const COLUMNS: { status: ApplicationStatus; label: string }[] = [
  { status: 'drafted', label: 'Drafted' },
  { status: 'submitted', label: 'Submitted' },
  { status: 'interview', label: 'Interview' },
  { status: 'offer', label: 'Offer' },
];

export function ApplicationsPage() {
  const { drafts, isLoading, fetchDrafts, moveDraft } = useApplicationsStore();
  const [selectedDraft, setSelectedDraft] = useState<ApplicationDraft | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id as ApplicationStatus;
    const draft = drafts.find((d) => d.id === active.id);
    if (draft && draft.status !== newStatus) {
      moveDraft(String(active.id), newStatus);
    }
  };

  const handleEdit = (draftId: string) => {
    console.log(`[stub] Edit application ${draftId}`);
  };

  const handleSubmitApplication = (draftId: string) => {
    console.log(`[stub] Submit application ${draftId}`);
    setSelectedDraft(null);
  };

  const handleMarkInterview = async (draftId: string) => {
    await moveDraft(draftId, 'interview');
    setSelectedDraft(null);
  };

  const draftsForColumn = (status: ApplicationStatus) =>
    drafts.filter((d) => {
      // "Approved" was removed from the board; show those cards in Submitted.
      if (status === 'submitted') return d.status === 'submitted' || d.status === 'approved';
      return d.status === status;
    });

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-4">
        <PageHeader
          title="Applications"
          description={`${drafts.length} applications tracked`}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="flex-1 overflow-x-auto px-6 pb-6">
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div
              className="grid gap-3 h-full w-full"
              style={{ gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(240px, 1fr))` }}
            >
              {COLUMNS.map(({ status, label }) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  label={label}
                  drafts={draftsForColumn(status)}
                  onCardClick={setSelectedDraft}
                />
              ))}
            </div>
          </DndContext>
        </div>
      )}

      {selectedDraft && (
        <ApplicationDetailModal
          draft={selectedDraft}
          onEdit={handleEdit}
          onSubmitApplication={handleSubmitApplication}
          onMarkInterview={handleMarkInterview}
          onClose={() => setSelectedDraft(null)}
        />
      )}
    </div>
  );
}
