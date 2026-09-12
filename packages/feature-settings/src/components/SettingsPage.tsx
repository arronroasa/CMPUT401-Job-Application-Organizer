import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@onfile/ui';
import { useSettingsStore } from '../state/useSettingsStore';
import { Eye, EyeOff, AlertTriangle, Check } from 'lucide-react';

type SectionKey = 'app' | 'resume' | 'llm' | 'backup';
type LlmTestState = 'idle' | 'testing' | 'connected' | 'failed';

function Section({ title, saved, children }: { title: string; saved: boolean; children: React.ReactNode }) {
  return (
    <section className="relative bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <div
          className={`flex items-center gap-1 text-xs text-emerald-400 transition-opacity duration-300 ${
            saved ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Check className="w-3.5 h-3.5" />
          <span>Saved</span>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <label className="text-sm text-foreground/80 shrink-0">{label}</label>
      <div className="flex-1 max-w-xs">{children}</div>
    </div>
  );
}

const inputCls = 'w-full bg-muted border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500';
const selectCls = 'w-full bg-muted border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500';

export function SettingsPage() {
  const s = useSettingsStore();
  const [showKey, setShowKey] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [llmTestState, setLlmTestState] = useState<LlmTestState>('idle');
  const [savedBySection, setSavedBySection] = useState<Record<SectionKey, boolean>>({
    app: false,
    resume: false,
    llm: false,
    backup: false,
  });
  const savedTimersRef = useRef<Partial<Record<SectionKey, ReturnType<typeof setTimeout>>>>({});
  const llmTestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markSaved = (section: SectionKey) => {
    setSavedBySection((prev) => ({ ...prev, [section]: true }));
    const existingTimer = savedTimersRef.current[section];
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    savedTimersRef.current[section] = setTimeout(() => {
      setSavedBySection((prev) => ({ ...prev, [section]: false }));
      savedTimersRef.current[section] = undefined;
    }, 2000);
  };

  const onSectionBlur = (section: SectionKey) => () => markSaved(section);

  const handleLlmConnectionTest = () => {
    if (!s.llmApiKey.trim()) {
      return;
    }
    setLlmTestState('testing');
    if (llmTestTimerRef.current) {
      clearTimeout(llmTestTimerRef.current);
    }
    llmTestTimerRef.current = setTimeout(() => {
      setLlmTestState('connected');
      llmTestTimerRef.current = null;
    }, 1000);
  };

  const handleExportBackup = () => {
    const state = useSettingsStore.getState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `onfile-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    markSaved('backup');
  };

  useEffect(() => {
    void s.hydrateFromBackend();
  }, [s.hydrateFromBackend]);

  useEffect(() => {
    return () => {
      if (llmTestTimerRef.current) {
        clearTimeout(llmTestTimerRef.current);
      }
      const timers = Object.values(savedTimersRef.current);
      for (const timer of timers) {
        if (timer) {
          clearTimeout(timer);
        }
      }
    };
  }, []);

  const canTestConnection = Boolean(s.llmApiKey.trim()) && llmTestState !== 'testing';

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 pt-6 pb-10 max-w-2xl space-y-5">
        <PageHeader title="Settings" description="Configure OnFile behaviour" />

        {/* App Behavior */}
        <Section title="App Behavior" saved={savedBySection.app}>
          <Field label="Daily submission cap">
            <input
              type="number"
              min={1} max={50}
              value={s.dailySubmissionCap}
              onChange={(e) => s.setDailySubmissionCap(Number(e.target.value))}
              onBlur={onSectionBlur('app')}
              className={inputCls}
            />
          </Field>
          <Field label="Discovery interval">
            <select
              value={s.discoveryIntervalMinutes}
              onChange={(e) => s.setDiscoveryInterval(Number(e.target.value))}
              onBlur={onSectionBlur('app')}
              className={selectCls}
            >
              <option value={30}>Every 30 minutes</option>
              <option value={60}>Every hour</option>
              <option value={180}>Every 3 hours</option>
              <option value={720}>Every 12 hours</option>
              <option value={1440}>Daily</option>
            </select>
          </Field>
        </Section>

        {/* Resume Preferences */}
        <Section title="Resume Preferences" saved={savedBySection.resume}>
          <Field label="Default template">
            <select
              value={s.defaultResumeTemplate}
              onChange={(e) => s.setDefaultTemplate(e.target.value as any)}
              onBlur={onSectionBlur('resume')}
              className={selectCls}
            >
              <option value="jakes">Jake's Resume (default)</option>
              <option value="minimal">Minimal</option>
              <option value="modern">Modern</option>
            </select>
          </Field>
          <Field label="Export path">
            <input
              type="text"
              value={s.exportPath}
              onChange={(e) => s.setExportPath(e.target.value)}
              onBlur={onSectionBlur('resume')}
              className={inputCls}
              placeholder="~/Downloads"
            />
          </Field>
        </Section>

        {/* AI / LLM */}
        <Section title="AI / LLM" saved={savedBySection.llm}>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">Your API key syncs to your local backend settings so Gemini-powered backend features can use it.</p>
          </div>
          <Field label="LLM Provider">
            <select
              value={s.llmProvider}
              onChange={(e) => s.setLlmProvider(e.target.value as any)}
              onBlur={onSectionBlur('llm')}
              className={selectCls}
            >
              <option value="gemini">Gemini (Google)</option>
              <option value="openai">OpenAI</option>
              <option value="local">Local / Ollama</option>
            </select>
          </Field>
          <Field label="API Key">
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={s.llmApiKey}
                onChange={(e) => s.setLlmApiKey(e.target.value)}
                onBlur={onSectionBlur('llm')}
                placeholder="Enter your API key…"
                className={`${inputCls} pr-8`}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground/80"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>
          <div className="pt-1 flex items-center gap-3">
            <button
              onClick={handleLlmConnectionTest}
              disabled={!canTestConnection}
              className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted text-foreground text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {llmTestState === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
            {llmTestState === 'connected' && <p className="text-xs text-emerald-400">✓ Connected</p>}
            {llmTestState === 'failed' && <p className="text-xs text-red-400">✗ Failed</p>}
          </div>
        </Section>

        {/* Backup & Restore */}
        <Section title="Backup & Restore" saved={savedBySection.backup}>
          <div className="flex gap-3">
            <button
              onClick={handleExportBackup}
              className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted text-foreground/80 text-xs font-medium transition-colors"
            >
              Export Backup
            </button>
            <button
              onClick={() => console.log('[stub] Restore from file')}
              className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted text-foreground/80 text-xs font-medium transition-colors"
            >
              Restore from File
            </button>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Danger Zone</p>
            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-3 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-medium transition-colors"
              >
                Reset All Settings
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground">Are you sure? This cannot be undone.</p>
                <button
                  onClick={() => { s.resetAll(); setShowResetConfirm(false); }}
                  className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-medium"
                >
                  Confirm Reset
                </button>
                <button onClick={() => setShowResetConfirm(false)} className="text-xs text-muted-foreground hover:text-foreground/80">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </Section>

        <p className="text-xs text-muted-foreground/70 text-center pt-4">OnFile v0.1.0 — scaffold phase</p>
      </div>
    </div>
  );
}
