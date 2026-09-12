import { useState } from 'react';
import type { InterviewKit, MockScore } from '@onfile/core';
import { scoreMockAnswer } from '@onfile/api';
import { useInterviewsStore } from '../state/useInterviewsStore';
import { ChevronRight, Loader2 } from 'lucide-react';

export function MockSimulatorTab({ kit }: { kit: InterviewKit }) {
  const { currentQuestionIndex, advanceQuestion, saveMockScore } = useInterviewsStore();
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [usedAi, setUsedAi] = useState(false);
  const [currentScore, setCurrentScore] = useState<MockScore | null>(null);

  const question = kit.questions[currentQuestionIndex];
  const handleSubmit = async () => {
    if (!answer.trim()) return;
    setFeedbackError('');
    setIsScoring(true);
    try {
      const response = await scoreMockAnswer(kit.id, {
        questionId: question?.id ?? `q-${currentQuestionIndex + 1}`,
        question: question?.question ?? question?.text ?? '[REQUIRES_REVIEW: missing question text]',
        answer: answer.trim(),
        category: question?.category ?? 'behavioral',
        difficulty: question?.difficulty ?? 'medium',
      });
      saveMockScore(response.data.score);
      setCurrentScore(response.data.score);
      setUsedAi(response.data.usedAi);
      setSubmitted(true);
    } catch {
      setFeedbackError('Unable to score right now. Please check backend connectivity and API key in Settings.');
      setCurrentScore(null);
      setSubmitted(true);
    } finally {
      setIsScoring(false);
    }
  };

  const handleNext = () => {
    advanceQuestion();
    setAnswer('');
    setSubmitted(false);
    setFeedbackError('');
    setUsedAi(false);
    setCurrentScore(null);
  };

  if (!question) return null;
  const questionText = question.question ?? question.text ?? '[REQUIRES_REVIEW: missing question text]';
  const questionDifficulty = question.difficulty ?? 'medium';

  const progressPercent = ((currentQuestionIndex + 1) / kit.questions.length) * 100;

  return (
    <div className="px-6 py-5 max-w-2xl">
      {/* Progress bar */}
      <div className="w-full h-1 bg-muted rounded-full mb-4 overflow-hidden">
        <div
          className="h-1 bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span>Question {currentQuestionIndex + 1} of {kit.questions.length}</span>
        <span className="text-muted-foreground/70">·</span>
        <span className="capitalize">{question.category.replace('_', ' ')}</span>
        <span className="text-muted-foreground/70">·</span>
        <span className="capitalize">{questionDifficulty}</span>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <p className="text-base text-foreground leading-relaxed">{questionText}</p>
        {question.contextNotes && (
          <p className="text-xs text-muted-foreground mt-2">{question.contextNotes}</p>
        )}
      </div>

      {!submitted ? (
        <>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer here…"
            rows={8}
            className="w-full bg-card border border-border rounded-lg p-4 text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleSubmit}
            disabled={!answer.trim() || isScoring}
            className="mt-3 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {isScoring ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Scoring...
              </span>
            ) : (
              'Submit Answer'
            )}
          </button>
          <button
            onClick={handleNext}
            disabled={isScoring}
            className="mt-3 ml-2 px-4 py-2 rounded-md bg-muted hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed text-foreground text-sm font-medium transition-colors"
          >
            Skip to Next
          </button>
        </>
      ) : (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Your Answer</p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{answer}</p>
          </div>

          <div className="bg-card border border-blue-500/20 rounded-xl p-5">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">Feedback</p>
            {feedbackError ? (
              <p className="text-sm text-red-300">{feedbackError}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {usedAi ? 'AI scoring enabled via Gemini.' : 'Scored with fallback rubric (Gemini unavailable).'}
              </p>
            )}
            <div className="mt-3 grid grid-cols-5 gap-2">
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Structure</div>
                <div className="text-sm font-semibold text-foreground">{currentScore?.structureScore ?? '—'}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Relevance</div>
                <div className="text-sm font-semibold text-foreground">{currentScore?.relevanceScore ?? '—'}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Depth</div>
                <div className="text-sm font-semibold text-foreground">{currentScore?.technicalDepth ?? '—'}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Specificity</div>
                <div className="text-sm font-semibold text-foreground">{currentScore?.specificity ?? '—'}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Clarity</div>
                <div className="text-sm font-semibold text-foreground">{currentScore?.clarity ?? '—'}</div>
              </div>
            </div>
            {typeof currentScore?.finalScore === 'number' && (
              <p className="mt-3 text-sm text-blue-300">Overall: {currentScore.finalScore}%</p>
            )}
            {currentScore?.suggestions?.length ? (
              <ul className="mt-3 space-y-1">
                {currentScore.suggestions.map((suggestion, idx) => (
                  <li key={`${currentScore.sessionId}-${idx}`} className="text-xs text-foreground/80">
                    • {suggestion}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-muted hover:bg-muted text-foreground text-sm font-medium transition-colors"
          >
            Next Question
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
