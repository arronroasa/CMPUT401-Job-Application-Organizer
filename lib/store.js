'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { seedData } from './seedData';
import { stageMeta } from './constants';

const StoreContext = createContext(null);
const STORAGE_KEY = 'trackwise-data-v1';

function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function StoreProvider({ children }) {
  const [data, setData] = useState(null);

  // Load once on mount (client-only — avoids SSR/localStorage mismatch)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      setData(raw ? JSON.parse(raw) : seedData);
    } catch {
      setData(seedData);
    }
  }, []);

  // Persist on every change
  useEffect(() => {
    if (data) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        // storage full or unavailable — fail silently, app still works in-memory
      }
    }
  }, [data]);

  function addApplication(app) {
    const id = uid('app');
    const stage = app.stage || 'applied';
    const dateApplied = app.dateApplied || todayISO();
    const newApp = {
      id,
      company: app.company,
      role: app.role,
      dateApplied,
      stage,
      location: app.location || '',
      notes: app.notes || '',
      resumeVersionId: app.resumeVersionId || null,
      nextAction: app.nextAction || null,
      timeline: [{ id: uid('t'), label: stageMeta(stage).label, date: dateApplied, stage }],
      communications: [],
    };
    setData((d) => ({ ...d, applications: [newApp, ...d.applications] }));
    return id;
  }

  function updateApplication(id, patch) {
    setData((d) => ({
      ...d,
      applications: d.applications.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }

  function moveStage(id, stage) {
    setData((d) => ({
      ...d,
      applications: d.applications.map((a) => {
        if (a.id !== id || a.stage === stage) return a;
        return {
          ...a,
          stage,
          timeline: [
            ...a.timeline,
            { id: uid('t'), label: `Moved to ${stageMeta(stage).label.toLowerCase()}`, date: todayISO(), stage },
          ],
        };
      }),
    }));
  }

  function deleteApplication(id) {
    setData((d) => ({ ...d, applications: d.applications.filter((a) => a.id !== id) }));
  }

  function addCommunication(appId, comm) {
    setData((d) => ({
      ...d,
      applications: d.applications.map((a) =>
        a.id === appId
          ? { ...a, communications: [{ id: uid('c'), date: todayISO(), ...comm }, ...a.communications] }
          : a
      ),
    }));
  }

  function setNextAction(appId, nextAction) {
    updateApplication(appId, { nextAction });
  }

  function completeNextAction(appId) {
    setData((d) => ({
      ...d,
      applications: d.applications.map((a) =>
        a.id === appId ? { ...a, nextAction: a.nextAction ? { ...a.nextAction, done: true } : null } : a
      ),
    }));
  }

  /**
   * Mark notifications as read by their timeline-entry id.
   *
   * Browsers holding data saved before notifications existed have no
   * `readNotifications` key, hence the `|| []` on every read.
   */
  function markNotificationsRead(ids) {
    if (!ids || ids.length === 0) return;
    setData((d) => {
      const read = new Set(d.readNotifications || []);
      const before = read.size;
      ids.forEach((id) => read.add(id));
      if (read.size === before) return d;
      return { ...d, readNotifications: [...read] };
    });
  }

  function saveMasterResume(patch) {
    setData((d) => ({ ...d, masterResume: { ...d.masterResume, ...patch } }));
  }

  function addTailoredResume(resume) {
    const id = uid('res');
    setData((d) => ({ ...d, tailoredResumes: [{ id, jobDescription: '', ...resume }, ...d.tailoredResumes] }));
    return id;
  }

  function updateTailoredResume(id, patch) {
    setData((d) => ({
      ...d,
      tailoredResumes: d.tailoredResumes.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }

  function deleteTailoredResume(id) {
    setData((d) => ({ ...d, tailoredResumes: d.tailoredResumes.filter((r) => r.id !== id) }));
  }

  const value = {
    data,
    addApplication,
    updateApplication,
    moveStage,
    deleteApplication,
    addCommunication,
    setNextAction,
    completeNextAction,
    markNotificationsRead,
    saveMasterResume,
    addTailoredResume,
    updateTailoredResume,
    deleteTailoredResume,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
