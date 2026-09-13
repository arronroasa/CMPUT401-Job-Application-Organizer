'use client';

import { useState } from 'react';
import { STAGES } from '@/lib/constants';
import { useStore } from '@/lib/store';
import KanbanCard from './KanbanCard';

export default function KanbanBoard({ applications, onOpen }) {
  const { moveStage } = useStore();
  const [dragOverStage, setDragOverStage] = useState(null);

  function handleDragStart(e, id) {
    e.dataTransfer.setData('text/plain', id);
  }

  function handleDrop(e, stageId) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) moveStage(id, stageId);
    setDragOverStage(null);
  }

  function shift(app, dir) {
    const i = STAGES.findIndex((s) => s.id === app.stage);
    const next = STAGES[Math.min(STAGES.length - 1, Math.max(0, i + dir))];
    if (next.id !== app.stage) moveStage(app.id, next.id);
  }

  return (
    // All five stages sit side by side and the board scrolls sideways when they
    // no longer fit. Below md they stack, since a kanban that wraps to a second
    // row stops reading as a pipeline.
    <div className="flex flex-col md:flex-row gap-3.5 md:h-full md:overflow-x-auto pb-2">
      {STAGES.map((stage, ci) => {
        const items = applications.filter((a) => a.stage === stage.id);
        return (
          <div
            key={stage.id}
            className="flex flex-col min-w-0 md:h-full md:min-w-[196px] md:flex-1"
            style={{ animation: `lsRise .5s cubic-bezier(.22,.8,.2,1) ${ci * 70}ms both` }}
          >
            <div className="flex items-center gap-2 px-1 pb-2.5">
              <span className={`shrink-0 w-2 h-2 rounded-full ${stage.dot}`} />
              <span className="font-display font-semibold text-[15px] text-ink">{stage.label}</span>
              <span className="ml-auto text-[12.5px] text-inkSoft">{items.length}</span>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(stage.id);
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => handleDrop(e, stage.id)}
              className={`flex flex-col gap-3.5 rounded-[14px] border p-2.5 min-h-[120px] md:flex-1 md:min-h-0 md:overflow-y-auto transition-colors ${
                dragOverStage === stage.id ? 'border-pine bg-mint/40' : 'border-line bg-panel'
              }`}
            >
              {items.map((app, ai) => {
                const i = STAGES.findIndex((s) => s.id === app.stage);
                return (
                  <div
                    key={app.id}
                    style={{ animation: `lsPop .45s cubic-bezier(.22,.8,.2,1) ${ci * 70 + ai * 50}ms both` }}
                  >
                    <KanbanCard
                      app={app}
                      onDragStart={handleDragStart}
                      onOpen={onOpen}
                      onShift={shift}
                      canBack={i > 0}
                      canFwd={i < STAGES.length - 1}
                    />
                  </div>
                );
              })}
              {items.length === 0 && (
                <div className="border border-dashed border-ink/15 rounded-[12px] py-6 text-center text-xs text-inkSoft">
                  Drop here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
