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
    <div className="grid grid-flow-col auto-cols-[minmax(200px,1fr)] gap-3.5 items-start overflow-x-auto pb-2">
      {STAGES.map((stage, ci) => {
        const items = applications.filter((a) => a.stage === stage.id);
        return (
          <div
            key={stage.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStage(stage.id);
            }}
            onDragLeave={() => setDragOverStage(null)}
            onDrop={(e) => handleDrop(e, stage.id)}
            className={`rounded-lg border px-3 pt-3.5 pb-4 min-h-[150px] transition-colors ${
              dragOverStage === stage.id ? 'border-pine bg-mint/40' : 'border-line bg-surface'
            }`}
            style={{ animation: `lsRise .5s cubic-bezier(.22,.8,.2,1) ${ci * 70}ms both` }}
          >
            <div className="flex items-center justify-between gap-2 px-2 pb-3">
              <span className="flex items-center gap-2 font-display font-semibold text-[15px] text-ink">
                <span
                  className={`w-2 h-2 rounded-full ${stage.dot} animate-[lsPulse_2.6s_ease-in-out_infinite]`}
                  style={{ animationDelay: `${(ci * 0.3).toFixed(2)}s` }}
                />
                {stage.label}
              </span>
              <span className="text-[12.5px] text-inkFaint">{items.length}</span>
            </div>
            <div className="flex flex-col gap-2.5 min-h-[40px]">
              {items.map((app, ai) => {
                const i = STAGES.findIndex((s) => s.id === app.stage);
                return (
                  <div key={app.id} style={{ animation: `lsPop .45s cubic-bezier(.22,.8,.2,1) ${ci * 70 + ai * 50}ms both` }}>
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
                <div className="border border-dashed border-ink/15 rounded-md py-6 text-center text-xs text-inkFaint">
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
