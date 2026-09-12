import { Download, FileType2 } from 'lucide-react';

interface ExportButtonsProps {
  resumeId: string;
  onExportLatex: (id: string) => void | Promise<void>;
  onExportPdf: (id: string) => void | Promise<void>;
}

export function ExportButtons({ resumeId, onExportLatex, onExportPdf }: ExportButtonsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => {
          void onExportLatex(resumeId);
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted hover:bg-muted text-foreground/80 text-xs font-medium transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Export LaTeX
      </button>
      <button
        onClick={() => {
          void onExportPdf(resumeId);
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted hover:bg-muted text-foreground/80 text-xs font-medium transition-colors"
      >
        <FileType2 className="w-3.5 h-3.5" />
        Export PDF
      </button>
    </div>
  );
}
