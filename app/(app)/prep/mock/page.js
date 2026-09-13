'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Play,
  ArrowLeft,
  Clock,
  Sparkles,
} from 'lucide-react';

const INTERVIEWER_SRC = '/mock/interviewer.mp4';

function formatTime(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function MockInterviewPage() {
  const aiRef = useRef(null);
  const selfRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  const [phase, setPhase] = useState('idle'); // idle | live | ended
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [camError, setCamError] = useState('');
  const [countdown, setCountdown] = useState(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (selfRef.current) selfRef.current.srcObject = null;
  }, []);

  const attachCamera = useCallback(async () => {
    setCamError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (selfRef.current) {
        selfRef.current.srcObject = stream;
        await selfRef.current.play().catch(() => {});
      }
      stream.getAudioTracks().forEach((t) => {
        t.enabled = micOn;
      });
      stream.getVideoTracks().forEach((t) => {
        t.enabled = camOn;
      });
      return true;
    } catch (err) {
      setCamError(
        err?.name === 'NotAllowedError'
          ? 'Camera or mic permission blocked. Allow access and try again.'
          : 'Could not reach your camera. Check that another app is not using it.'
      );
      return false;
    }
  }, [camOn, micOn]);

  const endInterview = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    const ai = aiRef.current;
    if (ai) {
      ai.pause();
      ai.currentTime = 0;
    }
    stopCamera();
    setPhase('ended');
    setCountdown(null);
  }, [stopCamera]);

  const startInterview = useCallback(async () => {
    setCountdown(3);
    for (let n = 3; n >= 1; n -= 1) {
      setCountdown(n);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 700));
    }
    setCountdown(null);

    const ok = await attachCamera();
    if (!ok) {
      setPhase('idle');
      return;
    }

    setElapsed(0);
    setPhase('live');

    const ai = aiRef.current;
    if (ai) {
      ai.currentTime = 0;
      ai.muted = false;
      await ai.play().catch(() => {
        ai.muted = true;
        return ai.play().catch(() => {});
      });
    }

    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed((t) => t + 1);
    }, 1000);
  }, [attachCamera]);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = micOn;
    });
  }, [micOn]);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = camOn;
    });
  }, [camOn]);

  return (
    <div className="px-4 sm:px-6 md:px-10 py-6 md:py-8 min-h-[calc(100dvh-7rem)] flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <Link
            href="/prep"
            className="inline-flex items-center gap-1.5 text-[13px] text-inkFaint hover:text-ink transition-colors mb-2"
          >
            <ArrowLeft size={14} /> Interview Prep
          </Link>
          <h1 className="font-display font-semibold text-[28px] sm:text-[34px] leading-none tracking-tight text-ink">
            Mock interview
          </h1>
          <p className="text-[14px] text-inkSoft mt-2 max-w-xl">
            Face an AI interviewer on camera. Practice answers out loud — same pressure, zero stakes.
          </p>
        </div>

        {phase === 'live' && (
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-[13px] text-ink tabular-nums">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-blush opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blush" />
            </span>
            <Clock size={14} className="text-inkFaint" />
            {formatTime(elapsed)}
          </div>
        )}
      </header>

      <div className="relative flex-1 min-h-[420px] rounded-[22px] overflow-hidden border border-line bg-[#07080a] shadow-card">
        {/* AI interviewer — main stage */}
        <video
          ref={aiRef}
          src={INTERVIEWER_SRC}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          loop
          muted={phase !== 'live'}
          autoPlay
          preload="auto"
        />

        {/* Soft vignette */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 40%, transparent 35%, rgba(0,0,0,.55) 100%), linear-gradient(to top, rgba(0,0,0,.72) 0%, transparent 42%)',
          }}
        />

        {/* Meet-style label on AI */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-full bg-black/55 backdrop-blur-md border border-white/10 px-3 py-1.5 text-[12.5px] text-white/90">
          <Sparkles size={13} className="text-honey" />
          Alex · AI interviewer
        </div>

        {/* Self view PiP */}
        <div className="absolute bottom-4 right-4 z-20 w-[38%] max-w-[280px] min-w-[140px] aspect-video rounded-xl overflow-hidden border border-white/20 bg-black/80 shadow-[0_12px_40px_rgba(0,0,0,.45)]">
          <video
            ref={selfRef}
            className={`h-full w-full object-cover scale-x-[-1] ${!camOn || phase === 'idle' || phase === 'ended' ? 'opacity-0' : 'opacity-100'}`}
            playsInline
            muted
            autoPlay
          />
          {(phase !== 'live' || !camOn) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/55 bg-[#101218]">
              <VideoOff size={22} />
              <span className="text-[11.5px] px-3 text-center">
                {phase === 'live' && !camOn ? 'Camera off' : 'Your camera'}
              </span>
            </div>
          )}
          <div className="absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-0.5 text-[11px] text-white/85">
            You
          </div>
        </div>

        {/* Countdown overlay */}
        {countdown != null && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
            <div className="font-display font-semibold text-white text-[96px] leading-none tabular-nums animate-pulse">
              {countdown}
            </div>
          </div>
        )}

        {/* Idle / ended center CTA */}
        {(phase === 'idle' || phase === 'ended') && countdown == null && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
            <div className="w-full max-w-md text-center rounded-[22px] border border-white/12 bg-black/55 backdrop-blur-md px-7 py-8 shadow-[0_20px_60px_rgba(0,0,0,.4)]">
              <p className="text-[11px] tracking-[0.18em] uppercase text-white/45 mb-3">
                {phase === 'ended' ? 'Session complete' : 'Ready when you are'}
              </p>
              <h2 className="font-display font-semibold text-[26px] sm:text-[30px] text-white leading-tight">
                {phase === 'ended' ? 'Nice work.' : 'Start a live mock round'}
              </h2>
              <p className="text-[14px] text-white/65 mt-3 leading-relaxed">
                {phase === 'ended'
                  ? `You practiced for ${formatTime(elapsed)}. Run it again while the answers are still warm.`
                  : 'We will turn on your camera and mic, then Alex will join on the other side of the call.'}
              </p>

              {camError && (
                <p className="mt-4 text-[13px] text-[#ffb4a8] bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
                  {camError}
                </p>
              )}

              <button
                type="button"
                onClick={startInterview}
                className="mt-6 inline-flex items-center justify-center gap-2.5 w-full sm:w-auto min-w-[200px] rounded-full bg-white text-[#0a0b0d] px-7 py-3.5 text-[15px] font-semibold hover:bg-white/92 transition-colors focus-ring"
              >
                <Play size={16} fill="currentColor" />
                {phase === 'ended' ? 'Start interview again' : 'Start Interview'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <ControlBtn
          active={micOn}
          label={micOn ? 'Mute' : 'Unmute'}
          onClick={() => setMicOn((v) => !v)}
          disabled={phase !== 'live'}
        >
          {micOn ? <Mic size={18} /> : <MicOff size={18} />}
        </ControlBtn>
        <ControlBtn
          active={camOn}
          label={camOn ? 'Stop camera' : 'Start camera'}
          onClick={() => setCamOn((v) => !v)}
          disabled={phase !== 'live'}
        >
          {camOn ? <Video size={18} /> : <VideoOff size={18} />}
        </ControlBtn>
        {phase === 'live' ? (
          <button
            type="button"
            onClick={endInterview}
            className="inline-flex items-center gap-2 rounded-full bg-blush text-ink px-6 py-3 text-[14px] font-semibold hover:opacity-90 transition-opacity focus-ring"
          >
            <PhoneOff size={16} />
            End interview
          </button>
        ) : (
          <button
            type="button"
            onClick={startInterview}
            className="inline-flex items-center gap-2 rounded-full bg-ink text-paper px-6 py-3 text-[14px] font-semibold hover:opacity-90 transition-opacity focus-ring"
          >
            <Play size={15} fill="currentColor" />
            Start Interview
          </button>
        )}
      </div>

      <p className="text-center text-[12px] text-inkFaint mt-4">
        Video stays in your browser · nothing is uploaded · practice out loud
      </p>
    </div>
  );
}

function ControlBtn({ children, active, label, onClick, disabled }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-12 w-12 items-center justify-center rounded-full border transition-colors focus-ring disabled:opacity-35 disabled:pointer-events-none ${
        active
          ? 'bg-surface border-line text-ink hover:bg-panel'
          : 'bg-ink/80 border-ink text-paper'
      }`}
    >
      {children}
    </button>
  );
}
