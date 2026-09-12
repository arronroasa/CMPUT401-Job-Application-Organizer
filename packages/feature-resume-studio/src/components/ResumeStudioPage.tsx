import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SplitPane, PageHeader } from '@onfile/ui';
import { Loader2, AlertCircle, GitCompareArrows, FileDown } from 'lucide-react';
import { useResumeStore } from '../state/useResumeStore';
import { VersionList } from './VersionList';
import { ResumePreview } from './ResumePreview';
import { DiffView } from './DiffView';
import { ExportButtons } from './ExportButtons';

export function ResumeStudioPage() {
  const [searchParams] = useSearchParams();
  const incomingJobId = searchParams.get('job_id');

  const {
    versions,
    selectedId,
    compareId,
    isLoading,
    generationStatus,
    generationError,
    activeJobId,
    fetchVersions,
    selectVersion,
    setCompareId,
    exportLatex,
    exportPdf,
    generateForJob,
    updateVersionContent,
  } = useResumeStore();

  // Always show ALL versions — never filter the sidebar by job.
  // activeJobId is only used to highlight the freshly-generated entry.
  const visibleVersions = useMemo(() => versions, [versions]);

  const selected = visibleVersions.find((v) => v.id === selectedId) ?? null;
  const compare = visibleVersions.find((v) => v.id === compareId) ?? null;
  const isComparing = !!(selected && compare);

  const handleCompareLeftSelect = (id: string) => {
    selectVersion(id);
    if (id === compareId) {
      const alternate = visibleVersions.find((v) => v.id !== id);
      setCompareId(alternate?.id ?? null);
    }
  };

  const handleCompareRightSelect = (id: string) => {
    if (id === selectedId) {
      const alternate = visibleVersions.find((v) => v.id !== id);
      setCompareId(alternate?.id ?? null);
      return;
    }
    setCompareId(id);
  };

  useEffect(() => {
    if (incomingJobId && incomingJobId !== activeJobId) {
      generateForJob(incomingJobId);
    } else {
      fetchVersions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingJobId]);

  useEffect(() => {
    if (visibleVersions.length === 0) return;
    if (!selectedId || !visibleVersions.some((v) => v.id === selectedId)) {
      selectVersion(visibleVersions[0].id);
    }
  }, [visibleVersions, selectedId, selectVersion]);

  const isGenerating = generationStatus === 'generating';

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-0">
        <PageHeader
          title="Resume Studio"
          description={
            isGenerating
              ? "Generating tailored resume in Jake's format…"
              : generationStatus === 'done' && activeJobId
                ? 'Tailored resume generated for this job'
                : `${visibleVersions.length} resume versions`
          }
          actions={
            selected && !isGenerating ? (
              <div className="flex items-center gap-2">
                {!isComparing ? (
                  <button
                    onClick={() => {
                      const other = visibleVersions.find((v) => v.id !== selectedId);
                      if (other) setCompareId(other.id);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted hover:bg-muted text-foreground/80 text-xs font-medium transition-colors"
                  >
                    <GitCompareArrows className="w-3.5 h-3.5" />
                    Compare
                  </button>
                ) : (
                  <button
                    onClick={() => setCompareId(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted text-foreground text-xs font-medium"
                  >
                    Exit Compare
                  </button>
                )}
                <ExportButtons
                  resumeId={selected.id}
                  onExportLatex={exportLatex}
                  onExportPdf={exportPdf}
                />
              </div>
            ) : null
          }
        />
      </div>

      <div className="flex-1 overflow-hidden mt-4">
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-sm text-muted-foreground">Tailoring your resume using your profile…</p>
            <p className="text-xs text-muted-foreground/70">This can take up to 1 minute</p>
          </div>
        ) : generationStatus === 'error' ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <AlertCircle className="w-7 h-7 text-red-400" />
            <p className="text-sm text-red-400">Generation failed</p>
            <p className="text-xs text-muted-foreground">{generationError}</p>
            {incomingJobId && (
              <button
                onClick={() => generateForJob(incomingJobId)}
                className="mt-2 px-3 py-1.5 rounded-md bg-muted hover:bg-muted text-foreground/80 text-xs font-medium"
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          <SplitPane
            leftWidth="w-64"
            left={
              isLoading ? (
                <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">Loading…</div>
              ) : (
                <VersionList versions={visibleVersions} selectedId={selectedId} onSelect={selectVersion} activeJobId={activeJobId} />
              )
            }
            right={
              isComparing && compare ? (
                <DiffView
                  versions={visibleVersions}
                  versionA={selected!}
                  versionB={compare}
                  onSelectA={handleCompareLeftSelect}
                  onSelectB={handleCompareRightSelect}
                />
              ) : selected ? (
                <ResumePreview
                  version={selected}
                  onExportPdf={() => exportPdf(selected.id)}
                  onSave={async (content) => updateVersionContent(selected.id, content)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-muted-foreground">
                  <FileDown className="w-8 h-8 text-muted-foreground/70" />
                  <p>Select a resume version from the sidebar</p>
                  <p className="text-xs text-muted-foreground/70">or click "Prepare Resume" on a job to generate new ones</p>
                </div>
              )
            }
          />
        )}
      </div>
    </div>
  );
}
