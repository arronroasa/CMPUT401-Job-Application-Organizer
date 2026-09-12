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

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
      {STAGES.map((stage) => {
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
            className={`w-64 shrink-0 rounded-lg border px-3 py-3 transition-colors ${
              dragOverStage === stage.id ? 'border-pine bg-pineSoft/40' : 'border-line bg-paper'
            }`}
          >
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className={`w-1.5 h-1.5 rounded-full ${stage.dot}`} />
              <h3 className="text-sm font-medium text-ink">{stage.label}</h3>
              <span className="text-xs text-inkFaint ml-auto">{items.length}</span>
            </div>
            <div className="flex flex-col gap-2 min-h-[60px]">
              {items.map((app) => (
                <KanbanCard key={app.id} app={app} onDragStart={handleDragStart} onOpen={onOpen} />
              ))}
              {items.length === 0 && (
                <div className="border border-dashed border-line rounded-md py-6 text-center text-xs text-inkFaint">
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
