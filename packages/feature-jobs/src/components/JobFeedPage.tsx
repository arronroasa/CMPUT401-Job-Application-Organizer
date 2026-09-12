import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Job, UserProfile } from '@onfile/core';
import { SplitPane, PageHeader } from '@onfile/ui';
import { useJobsStore } from '../state/useJobsStore';
import { JobList } from './JobList';
import { JobDetail } from './JobDetail';
import {
  type AssistedProgressEvent,
  type AssistedProgressResult,
  type BrowserAssistedSessionProgressResult,
  type BrowserConnectionStatus,
  type BrowserDiscoverySource,
  type ChatMessage,
  approveDraft,
  checkBrowserConnection,
  getChatMessages,
  getAssistedProgress,
  getBrowserAssistedDiscoveryMessages,
  getBrowserAssistedDiscoveryProgress,
  getDiscoveryStatus,
  getProfile,
  postBrowserAssistedDiscoveryMessage,
  postChatMessage,
  prepareDraft,
  markAssistedSubmitted,
  startBrowserAssistedDiscoverySession,
  runAssistedConfirmSubmit,
  runAssistedFill,
} from '@onfile/api';

type LocationFilter = 'canada' | 'us' | 'remote' | 'all';
type ActivityTab = 'agent' | 'chat';
type DiscoveryTab = 'plan' | 'agent' | 'chat';

const CANADA_HINTS = [
  'canada',
  'toronto',
  'vancouver',
  'montreal',
  'ottawa',
  'calgary',
  'edmonton',
  'winnipeg',
  'quebec',
  'ontario',
  'british columbia',
  'alberta',
  'saskatchewan',
  'manitoba',
  'nova scotia',
  'new brunswick',
  'newfoundland',
  'prince edward',
];

const US_HINTS = [
  'united states',
  ' usa',
  ', usa',
  'new york',
  'san francisco',
  'seattle',
  'los angeles',
  'austin',
  'chicago',
  'boston',
];

const MACOS_CHROME_DEBUG_COMMAND =
  'open -na "Google Chrome" --args --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --user-data-dir=/tmp/onfile-cdp';
const WINDOWS_CHROME_DEBUG_COMMAND =
  'chrome.exe --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --user-data-dir=%TEMP%\\onfile-cdp';
const VERIFY_CDP_COMMAND = 'curl http://localhost:9222/json/version';
const LOCATION_FILTER_STORAGE_KEY = 'onfile.jobs.location-filter';
const DISCOVERY_RUN_STORAGE_KEY = 'onfile.discovery.run-id';

interface AssistedReviewState {
  draftId: string;
  screenshotUrl?: string;
  screenshotPath?: string;
  mode?: string;
  updatedAt?: string | null;
  events: AssistedProgressEvent[];
}

interface NoticeState {
  tone: 'info' | 'success' | 'error';
  message: string;
}

interface AutoDiscoveryPlan {
  role: string;
  locationHint: string;
  query: string;
  sources: BrowserDiscoverySource[];
}

function includesAny(haystack: string, values: string[]): boolean {
  return values.some((value) => haystack.includes(value));
}

function matchesLocationFilter(job: Job, filter: LocationFilter): boolean {
  if (filter === 'all') return true;
  const location = String(job.location ?? '').toLowerCase();
  const remote = Boolean(job.remote) || location.includes('remote');
  if (filter === 'remote') return remote;
  if (filter === 'canada') return includesAny(location, CANADA_HINTS);
  if (filter === 'us') return includesAny(location, US_HINTS);
  return true;
}

function pickLocationHint(filter: LocationFilter, profile: UserProfile | null): string {
  if (filter === 'canada') return 'canada';
  if (filter === 'us') return 'united states';
  if (filter === 'remote') return 'remote';
  const firstRoleLocation = profile?.roleInterests?.[0]?.locations?.[0]?.trim();
  if (firstRoleLocation) return firstRoleLocation;
  const profileLocation = profile?.location?.trim();
  if (profileLocation) return profileLocation;
  return 'canada';
}

function buildAutoDiscoveryPlan(filter: LocationFilter, profile: UserProfile | null): AutoDiscoveryPlan {
  const role =
    profile?.roleInterests?.map((item) => item.title.trim()).find((title) => Boolean(title)) ||
    'software engineer';
  const locationHint = pickLocationHint(filter, profile);
  const query = `${role} ${locationHint}`.replace(/\s+/g, ' ').trim();
  return {
    role,
    locationHint,
    query,
    sources: ['linkedin'],
  };
}

function prettyPhase(phase?: string): string {
  const value = String(phase ?? '').trim().toLowerCase();
  if (!value) return 'running';
  if (value === 'linkedin_handoff') return 'linkedin handoff';
  return value.replace(/_/g, ' ');
}

function prettyUserAction(action?: string | null): string {
  const value = String(action ?? '').trim().toLowerCase();
  if (!value || value === 'none') return '';
  return value.replace(/_/g, ' ');
}

function loadPersistedLocationFilter(): LocationFilter {
  if (typeof window === 'undefined') return 'canada';
  const raw = window.localStorage.getItem(LOCATION_FILTER_STORAGE_KEY);
  if (raw === 'canada' || raw === 'us' || raw === 'remote' || raw === 'all') {
    return raw;
  }
  return 'canada';
}

function loadPersistedDiscoveryRunId(): string {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(DISCOVERY_RUN_STORAGE_KEY)?.trim() ?? '';
}

export function JobFeedPage() {
  const navigate = useNavigate();
  const {
    jobs,
    selectedJobId,
    isLoading,
    lastFetchedAt,
    fetchJobs,
    selectJob,
    markInterested,
    removeJobs,
    clearAllJobs,
  } = useJobsStore();
  const didBootstrapFetchRef = useRef(false);
  const [checkedJobIds, setCheckedJobIds] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState<LocationFilter>(() => loadPersistedLocationFilter());
  const [useVisibleBrowser, setUseVisibleBrowser] = useState(true);
  const [assistedReview, setAssistedReview] = useState<AssistedReviewState | null>(null);
  const [isSubmittingFinal, setIsSubmittingFinal] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isRunningFill, setIsRunningFill] = useState(false);
  const [runningDraftId, setRunningDraftId] = useState<string | null>(null);
  const [runningJobUrl, setRunningJobUrl] = useState<string | null>(null);
  const [runningProgress, setRunningProgress] = useState<AssistedProgressResult | null>(null);
  const [runningTab, setRunningTab] = useState<ActivityTab>('agent');
  const [reviewTab, setReviewTab] = useState<ActivityTab>('agent');
  const progressTimerRef = useRef<number | null>(null);
  const discoveryTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [startApplyJobId, setStartApplyJobId] = useState<string | null>(null);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [isPlanningDiscovery, setIsPlanningDiscovery] = useState(false);
  const [browserStatus, setBrowserStatus] = useState<BrowserConnectionStatus | null>(null);
  const [isCheckingBrowser, setIsCheckingBrowser] = useState(false);
  const [autoDiscoveryPlan, setAutoDiscoveryPlan] = useState<AutoDiscoveryPlan | null>(null);
  const [profileRoles, setProfileRoles] = useState<string[]>([]);
  const [selectedRoleIndex, setSelectedRoleIndex] = useState<number>(0);
  const [customQuery, setCustomQuery] = useState<string>('');
  const [queryEdited, setQueryEdited] = useState<boolean>(false);
  const [discoveryRunId, setDiscoveryRunId] = useState<string | null>(null);
  const [discoveryProgress, setDiscoveryProgress] = useState<BrowserAssistedSessionProgressResult | null>(null);
  const [discoveryMessages, setDiscoveryMessages] = useState<ChatMessage[]>([]);
  const [discoveryChatInput, setDiscoveryChatInput] = useState('');
  const [isSendingDiscoveryChat, setIsSendingDiscoveryChat] = useState(false);
  const [discoveryTab, setDiscoveryTab] = useState<DiscoveryTab>('plan');
  const discoveryChatEndRef = useRef<HTMLDivElement | null>(null);
  const discoveryLastImportedRef = useRef<number>(0);
  const discoveryLastSourceDoneRef = useRef<number>(0);
  const discoveryPollErrorRef = useRef<number>(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const filteredJobs = useMemo(
    () => jobs.filter((job) => matchesLocationFilter(job, locationFilter)),
    [jobs, locationFilter]
  );
  const selectedJob = filteredJobs.find((j) => j.id === selectedJobId) ?? null;
  const startApplyJob = useMemo(
    () => (startApplyJobId ? jobs.find((job) => job.id === startApplyJobId) ?? null : null),
    [jobs, startApplyJobId]
  );
  const visibleIdSet = useMemo(() => new Set(filteredJobs.map((job) => job.id)), [filteredJobs]);
  const checkedVisibleCount = useMemo(
    () => checkedJobIds.filter((id) => visibleIdSet.has(id)).length,
    [checkedJobIds, visibleIdSet]
  );
  const allVisibleChecked = filteredJobs.length > 0 && checkedVisibleCount === filteredJobs.length;

  useEffect(() => {
    if (!didBootstrapFetchRef.current) {
      didBootstrapFetchRef.current = true;
      void fetchJobs({ silent: jobs.length > 0 });
      return;
    }
    const hasJobs = jobs.length > 0;
    const isFresh = lastFetchedAt !== null && Date.now() - lastFetchedAt < 45_000;
    if (!hasJobs) {
      void fetchJobs();
      return;
    }
    if (!isFresh) {
      void fetchJobs({ silent: true });
    }
  }, [fetchJobs, jobs.length, lastFetchedAt]);

  useEffect(() => {
    if (!filteredJobs.length) return;
    if (!selectedJobId || !filteredJobs.some((job) => job.id === selectedJobId)) {
      selectJob(filteredJobs[0].id);
    }
  }, [filteredJobs, selectedJobId, selectJob]);

  useEffect(() => {
    const currentIds = new Set(jobs.map((job) => job.id));
    setCheckedJobIds((prev) => prev.filter((id) => currentIds.has(id)));
  }, [jobs]);

  const toggleJobChecked = (jobId: string, checked: boolean) => {
    setCheckedJobIds((prev) => {
      if (checked) {
        if (prev.includes(jobId)) return prev;
        return [...prev, jobId];
      }
      return prev.filter((id) => id !== jobId);
    });
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setCheckedJobIds((prev) => {
      if (checked) {
        const merged = new Set(prev);
        for (const job of filteredJobs) merged.add(job.id);
        return Array.from(merged);
      }
      const visible = new Set(filteredJobs.map((job) => job.id));
      return prev.filter((id) => !visible.has(id));
    });
  };

  const handleRemoveSelectedJobs = async () => {
    const idsToRemove = checkedJobIds.filter((id) => visibleIdSet.has(id));
    if (idsToRemove.length === 0) {
      pushNotice('Select at least one job to remove.', 'info');
      return;
    }
    if (!window.confirm(`Remove ${idsToRemove.length} selected job(s) from your feed?`)) {
      return;
    }
    try {
      await removeJobs(idsToRemove);
      const removedSet = new Set(idsToRemove);
      setCheckedJobIds((prev) => prev.filter((id) => !removedSet.has(id)));
      pushNotice(`Removed ${idsToRemove.length} job(s) from your feed.`, 'success');
    } catch (error) {
      pushNotice(error instanceof Error ? error.message : 'Failed to remove selected jobs.', 'error');
    }
  };

  const handleClearAllJobs = async () => {
    if (jobs.length === 0) return;
    if (!window.confirm('Clear all jobs from the feed? This cannot be undone.')) {
      return;
    }
    try {
      const archived = await clearAllJobs();
      setCheckedJobIds([]);
      pushNotice(`Cleared ${archived} job(s) from your feed.`, 'success');
    } catch (error) {
      pushNotice(error instanceof Error ? error.message : 'Failed to clear jobs.', 'error');
    }
  };

  const stopProgressPolling = () => {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const stopDiscoveryPolling = () => {
    if (discoveryTimerRef.current !== null) {
      window.clearInterval(discoveryTimerRef.current);
      discoveryTimerRef.current = null;
    }
  };

  const pollProgressOnce = async (draftId: string) => {
    const [progress, chat] = await Promise.all([
      getAssistedProgress(draftId),
      getChatMessages(draftId),
    ]);
    if (!progress.error) {
      setRunningProgress(progress.data);
    }
    if (!chat.error) {
      setChatMessages(chat.data.messages);
      // Auto-scroll to bottom when new messages arrive
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  const startProgressPolling = (draftId: string) => {
    stopProgressPolling();
    setChatMessages([]);
    void pollProgressOnce(draftId);
    progressTimerRef.current = window.setInterval(() => {
      void pollProgressOnce(draftId);
    }, 1200);
  };

  const pollDiscoveryOnce = async (runId: string) => {
    const [progressResult, messagesResult] = await Promise.all([
      getBrowserAssistedDiscoveryProgress(runId),
      getBrowserAssistedDiscoveryMessages(runId),
    ]);

    if (!progressResult.error) {
      discoveryPollErrorRef.current = 0;
      const progress = progressResult.data;
      setDiscoveryProgress(progress);

      const completedSources = (progress.source_results ?? []).filter(
        (item) => item.status === 'completed'
      ).length;
      const hasNewImported = progress.jobs_new > discoveryLastImportedRef.current;
      const hasNewCompletedSource = completedSources > discoveryLastSourceDoneRef.current;

      if (hasNewImported || hasNewCompletedSource) {
        discoveryLastImportedRef.current = progress.jobs_new;
        discoveryLastSourceDoneRef.current = completedSources;
      }

      if (progress.status === 'running') {
        if (hasNewImported || hasNewCompletedSource) {
          await fetchJobs();
        }
      }

      if (progress.status === 'completed' || progress.status === 'failed' || progress.status === 'cancelled') {
        stopDiscoveryPolling();
        setIsDiscovering(false);
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(DISCOVERY_RUN_STORAGE_KEY);
        }
        await fetchJobs();
        if (progress.status === 'completed') {
          pushNotice(
            `Auto-search complete: ${progress.jobs_found} extracted, ${progress.jobs_new} new jobs added to your feed.`,
            'success'
          );
        } else if (progress.status === 'cancelled') {
          pushNotice('Auto-search stopped by operator guidance.', 'info');
        } else {
          pushNotice(progress.error ?? 'Auto-search failed.', 'error');
        }
      }
    } else {
      discoveryPollErrorRef.current += 1;
      const statusCode = Number(progressResult.status ?? 0);
      const runMissing =
        statusCode === 404 ||
        (progressResult.error ?? '').toLowerCase().includes('not found');
      if (discoveryPollErrorRef.current < 4 && !runMissing) {
        return;
      }
      stopDiscoveryPolling();
      setIsDiscovering(false);
      setDiscoveryRunId(null);
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(DISCOVERY_RUN_STORAGE_KEY);
      }
      pushNotice(progressResult.error, 'error');
      return;
    }

    if (!messagesResult.error) {
      setDiscoveryMessages(messagesResult.data.messages);
      setTimeout(() => discoveryChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
    }
  };

  const startDiscoveryPolling = (runId: string) => {
    stopDiscoveryPolling();
    discoveryPollErrorRef.current = 0;
    void pollDiscoveryOnce(runId);
    discoveryTimerRef.current = window.setInterval(() => {
      void pollDiscoveryOnce(runId);
    }, 1200);
  };

  useEffect(() => {
    let cancelled = false;
    const restoreDiscoveryRun = async () => {
      let runId = loadPersistedDiscoveryRunId();
      if (!runId) {
        const statusResult = await getDiscoveryStatus();
        if (!statusResult.error && statusResult.data.status === 'running' && statusResult.data.id) {
          runId = statusResult.data.id;
        }
      }
      if (!runId || cancelled) return;

      const [progressResult, messagesResult] = await Promise.all([
        getBrowserAssistedDiscoveryProgress(runId),
        getBrowserAssistedDiscoveryMessages(runId),
      ]);
      if (cancelled || progressResult.error) return;
      if (progressResult.data.status !== 'running') {
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(DISCOVERY_RUN_STORAGE_KEY);
        }
        return;
      }

      setDiscoveryRunId(runId);
      setDiscoveryProgress(progressResult.data);
      setIsDiscovering(true);
      if (!messagesResult.error) {
        setDiscoveryMessages(messagesResult.data.messages);
      }
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(DISCOVERY_RUN_STORAGE_KEY, runId);
      }
      startDiscoveryPolling(runId);
    };

    void restoreDiscoveryRun();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      stopProgressPolling();
      stopDiscoveryPolling();
    },
    []
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LOCATION_FILTER_STORAGE_KEY, locationFilter);
  }, [locationFilter]);

  const handleSendDiscoveryChat = async () => {
    const runId = discoveryRunId;
    const text = discoveryChatInput.trim();
    if (!runId || !text || isSendingDiscoveryChat) return;
    setIsSendingDiscoveryChat(true);
    setDiscoveryChatInput('');
    const result = await postBrowserAssistedDiscoveryMessage(runId, text);
    setIsSendingDiscoveryChat(false);
    if (result.error) {
      pushNotice(result.error, 'error');
      return;
    }
    setDiscoveryMessages(result.data.messages);
    setTimeout(() => discoveryChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
  };

  const handleSendChat = async () => {
    const draftId = runningDraftId ?? assistedReview?.draftId ?? null;
    const text = chatInput.trim();
    if (!draftId || !text || isSendingChat) return;
    setIsSendingChat(true);
    setChatInput('');
    const result = await postChatMessage(draftId, text);
    setIsSendingChat(false);
    if (result.error) {
      pushNotice(result.error, 'error');
      return;
    }
    setChatMessages(result.data.messages);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const pushNotice = (message: string, tone: NoticeState['tone'] = 'info') => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    setNotice({ tone, message });
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 4200);
  };

  useEffect(
    () => () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    },
    []
  );

  const copyCommand = async (command: string, label: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(command);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = command;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      pushNotice(`${label} command copied. Paste and run it in terminal.`, 'success');
    } catch {
      pushNotice(`Could not copy ${label} command. Copy it manually.`, 'error');
    }
  };

  const handlePrepareResume = (jobId: string) => {
    navigate(`/resume-studio?job_id=${encodeURIComponent(jobId)}`);
  };

  const runAssistedApplicationFlow = async (jobId: string) => {
    const targetJob = jobs.find((job) => job.id === jobId);
    if (!targetJob) {
      pushNotice('Job not found.', 'error');
      return;
    }

    const prepared = await prepareDraft(jobId);
    if (prepared.error || !prepared.data.id) {
      pushNotice(prepared.error ?? 'Failed to prepare draft.', 'error');
      return;
    }

    const approved = await approveDraft(prepared.data.id);
    if (approved.error) {
      pushNotice(approved.error, 'error');
      return;
    }

    setRunningTab('agent');
    setRunningProgress(null);
    setRunningDraftId(prepared.data.id);
    setRunningJobUrl(targetJob.sourceUrl || null);
    setIsRunningFill(true);
    startProgressPolling(prepared.data.id);

    const fillResult = await runAssistedFill(prepared.data.id, {
      useVisibleBrowser,
      pauseForManualInputSeconds: useVisibleBrowser ? 20 : 0,
    });

    stopProgressPolling();
    const latestProgressResult = await getAssistedProgress(prepared.data.id);
    const latestProgress = latestProgressResult.error ? runningProgress : latestProgressResult.data;
    if (latestProgress) {
      setRunningProgress(latestProgress);
    }

    setIsRunningFill(false);
    setRunningDraftId(null);
    setRunningJobUrl(null);

    if (fillResult.error) {
      pushNotice(fillResult.error, 'error');
      return;
    }

    setReviewTab('agent');
    setAssistedReview({
      draftId: prepared.data.id,
      screenshotUrl: fillResult.data.screenshot_url ?? latestProgress?.latest_screenshot_url,
      screenshotPath: fillResult.data.screenshot_path ?? latestProgress?.latest_screenshot_path,
      mode: fillResult.data.mode ?? latestProgress?.mode,
      updatedAt: latestProgress?.updated_at,
      events: latestProgress?.events ?? [],
    });
  };

  const handleFinalSubmit = async () => {
    if (!assistedReview || isSubmittingFinal) return;
    if (
      useVisibleBrowser &&
      !window.confirm('Confirm you already clicked submit in the browser page. Continue?')
    ) {
      return;
    }
    setIsSubmittingFinal(true);
    const submitted = useVisibleBrowser
      ? await markAssistedSubmitted(assistedReview.draftId)
      : await runAssistedConfirmSubmit(assistedReview.draftId, {
          useVisibleBrowser,
        });
    setIsSubmittingFinal(false);
    if (submitted.error) {
      pushNotice(submitted.error, 'error');
      return;
    }
    setAssistedReview(null);
    await fetchJobs();
    pushNotice(`Application submitted with status: ${submitted.data.status}`, 'success');
  };

  const handleReviewLater = () => {
    if (!assistedReview) return;
    pushNotice(`Draft ${assistedReview.draftId} is approved and ready for final submit later.`, 'info');
    setAssistedReview(null);
  };

  const handleEndChat = () => {
    stopProgressPolling();
    setIsRunningFill(false);
    setRunningDraftId(null);
    setRunningJobUrl(null);
    setRunningProgress(null);
    setAssistedReview(null);
    setChatInput('');
    setChatMessages([]);
    pushNotice('Chat closed.', 'info');
  };

  const handlePrepareApplication = (jobId: string) => {
    setStartApplyJobId(jobId);
  };

  const handleConfirmStartApply = () => {
    if (!startApplyJobId) return;
    const jobId = startApplyJobId;
    setStartApplyJobId(null);
    void runAssistedApplicationFlow(jobId);
  };

  const handleCheckBrowser = async () => {
    setIsCheckingBrowser(true);
    const result = await checkBrowserConnection();
    setBrowserStatus(result.data);
    setIsCheckingBrowser(false);
  };

  const openDiscoveryModal = async () => {
    const persistedRunId = loadPersistedDiscoveryRunId();
    if (!discoveryRunId && persistedRunId) {
      setDiscoveryRunId(persistedRunId);
      setIsDiscovering(true);
      startDiscoveryPolling(persistedRunId);
    }
    setShowDiscoveryModal(true);
    setIsPlanningDiscovery(true);
    const activeRunId = discoveryRunId || persistedRunId;
    setDiscoveryTab(activeRunId ? 'agent' : 'plan');
    if (!activeRunId) {
      setAutoDiscoveryPlan(null);
      setDiscoveryProgress(null);
      setDiscoveryMessages([]);
      setDiscoveryChatInput('');
      setQueryEdited(false);
    }
    await handleCheckBrowser();
    try {
      const profileResult = await getProfile();
      const profile = profileResult.error ? null : profileResult.data ?? null;
      const roles = (profile?.roleInterests ?? [])
        .map((r: { title: string }) => r.title.trim())
        .filter(Boolean);
      setProfileRoles(roles);
      setSelectedRoleIndex(0);
      const plan = buildAutoDiscoveryPlan(locationFilter, profile);
      setAutoDiscoveryPlan(plan);
      // Only set the query if user hasn't manually edited it
      setCustomQuery((prev) => (prev && queryEdited ? prev : plan.query));
    } catch {
      const plan = buildAutoDiscoveryPlan(locationFilter, null);
      setAutoDiscoveryPlan(plan);
      setProfileRoles([]);
      setSelectedRoleIndex(0);
      setCustomQuery((prev) => (prev && queryEdited ? prev : plan.query));
    } finally {
      setIsPlanningDiscovery(false);
    }
  };

  // When user picks a different role, auto-rebuild the query (unless manually edited)
  const handleRoleChange = (index: number) => {
    setSelectedRoleIndex(index);
    if (!queryEdited && autoDiscoveryPlan) {
      const role = profileRoles[index] ?? autoDiscoveryPlan.role;
      const newQuery = `${role} ${autoDiscoveryPlan.locationHint}`.replace(/\s+/g, ' ').trim();
      setCustomQuery(newQuery);
      setAutoDiscoveryPlan((prev) => prev ? { ...prev, role, query: newQuery } : prev);
    }
  };

  const handleBrowserAssistedDiscovery = async () => {
    const plan = autoDiscoveryPlan ?? buildAutoDiscoveryPlan(locationFilter, null);
    // Use the user's custom query if set, otherwise fall back to auto-built plan query
    const query = (customQuery.trim() || plan.query).trim();
    if (!query) {
      pushNotice('Search query is required.', 'error');
      return;
    }

    setIsDiscovering(true);
    setDiscoveryTab('agent');
    setDiscoveryMessages([]);
    setDiscoveryProgress(null);
    discoveryLastImportedRef.current = 0;
    discoveryLastSourceDoneRef.current = 0;

    const start = await startBrowserAssistedDiscoverySession({
      query,
      sources: plan.sources,
      useVisibleBrowser,
      waitSeconds: 6,
      maxResults: 300,
      minMatchScore: 0.0,
    });
    if (start.error || !start.data.run_id) {
      setIsDiscovering(false);
      pushNotice(start.error ?? 'Could not start AI browser search.', 'error');
      return;
    }
    setDiscoveryRunId(start.data.run_id);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(DISCOVERY_RUN_STORAGE_KEY, start.data.run_id);
    }
    startDiscoveryPolling(start.data.run_id);
  };

  const handleStopDiscovery = async () => {
    if (!discoveryRunId) return;
    const result = await postBrowserAssistedDiscoveryMessage(discoveryRunId, 'stop');
    if (result.error) {
      pushNotice(result.error, 'error');
      return;
    }
    setDiscoveryMessages(result.data.messages);
    pushNotice('Stop requested. The agent will halt after the current browser step.', 'info');
  };

  const discoveryElapsedSeconds = discoveryProgress?.elapsed_seconds ?? 0;
  const discoveryEstimatedSeconds = discoveryProgress?.estimated_duration_seconds ?? 0;
  const discoveryRuntimeLabel =
    discoveryEstimatedSeconds > 0
      ? `${discoveryElapsedSeconds}s elapsed of ~${discoveryEstimatedSeconds}s`
      : `${discoveryElapsedSeconds}s elapsed`;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="Job Feed"
            description={`${filteredJobs.length} opportunities shown (${locationFilter.toUpperCase()} filter)`}
          />
          <div className="mt-1 flex items-center gap-2">
            <select
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value as LocationFilter)}
              className="rounded-md border border-border bg-muted px-2 py-1.5 text-xs text-foreground"
              title="Filter visible jobs by location"
            >
              <option value="canada">Canada (default)</option>
              <option value="us">United States</option>
              <option value="remote">Remote</option>
              <option value="all">All locations</option>
            </select>
            <label className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1.5 text-[11px] text-foreground">
              <input
                type="checkbox"
                checked={useVisibleBrowser}
                onChange={(event) => setUseVisibleBrowser(event.target.checked)}
              />
              Visible Browser
            </label>
            <button
              onClick={() => void openDiscoveryModal()}
              className="relative rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
              title="AI agent searches LinkedIn and imports matched jobs"
            >
              {isDiscovering && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-red-400" />
              )}
              {isDiscovering ? 'View Search' : 'AI Auto Search'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden mt-4">
        <SplitPane
          leftWidth="w-80"
          left={
            isLoading && filteredJobs.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                Loading jobs…
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-foreground/80">
                    <input
                      type="checkbox"
                      checked={allVisibleChecked}
                      onChange={(event) => toggleSelectAllVisible(event.target.checked)}
                      disabled={filteredJobs.length === 0}
                      className="h-3.5 w-3.5 rounded border-border bg-muted text-blue-500"
                    />
                    Select all
                  </label>
                  <span className="text-[11px] text-muted-foreground">{checkedVisibleCount} selected</span>
                  <button
                    onClick={() => void handleRemoveSelectedJobs()}
                    disabled={checkedVisibleCount === 0}
                    className="ml-auto rounded-md bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove Selected
                  </button>
                  <button
                    onClick={() => void handleClearAllJobs()}
                    disabled={jobs.length === 0}
                    className="rounded-md bg-red-900/50 px-2.5 py-1 text-[11px] font-medium text-red-100 hover:bg-red-800/60 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Clear All
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <JobList
                    jobs={filteredJobs}
                    selectedJobId={selectedJobId}
                    selectedIds={checkedJobIds}
                    onSelect={selectJob}
                    onToggleSelected={toggleJobChecked}
                  />
                </div>
              </div>
            )
          }
          right={
            selectedJob ? (
              <JobDetail
                job={selectedJob}
                onPrepareResume={handlePrepareResume}
                onPrepareApplication={handlePrepareApplication}
                onMarkInterested={markInterested}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Select a job to view details
              </div>
            )
          }
        />
      </div>

      {notice && (
        <div
          className={`fixed bottom-4 right-4 z-[70] w-full max-w-md rounded-lg border px-4 py-3 shadow-2xl ${
            notice.tone === 'error'
              ? 'border-red-800 bg-red-950/90 text-red-100'
              : notice.tone === 'success'
                ? 'border-emerald-700 bg-emerald-950/90 text-emerald-100'
                : 'border-border bg-card/95 text-foreground'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm leading-relaxed">{notice.message}</p>
            <button
              onClick={() => setNotice(null)}
              className="shrink-0 rounded-md bg-black/25 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-black/40"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {startApplyJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setStartApplyJobId(null)} />
          <div className="relative w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">Start AI-Assisted Apply?</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                The agent will fill fields first, then wait for your explicit final submit confirmation.
              </p>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm text-foreground/80">
              <div className="rounded-md border border-border bg-background/70 p-3">
                <p className="font-medium text-foreground">
                  {startApplyJob.title} at {startApplyJob.company}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Source: {startApplyJob.source}
                  {startApplyJob.sourceUrl ? ` • ${startApplyJob.sourceUrl}` : ''}
                </p>
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  Mode:{' '}
                  <span className="font-medium text-foreground">
                    {useVisibleBrowser ? 'Visible Browser (user can intervene)' : 'Managed Browser'}
                  </span>
                </li>
                <li>Step 1: AI fills draft fields.</li>
                <li>Step 2: You review browser activity.</li>
                <li>Step 3: You decide whether to submit.</li>
              </ul>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <button
                onClick={() => setStartApplyJobId(null)}
                className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmStartApply}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                Start Assisted Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {showDiscoveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowDiscoveryModal(false)} />
          <div className="relative w-full max-w-2xl rounded-xl border border-border bg-card shadow-2xl">
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-foreground">AI Auto Search</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pick a role and query, then the agent searches LinkedIn and imports matched jobs.
                  </p>
                </div>
                {isDiscovering && (
                  <button
                    onClick={() => void handleStopDiscovery()}
                    className="shrink-0 flex items-center gap-1.5 rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-600"
                  >
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-300" />
                    Stop Search
                  </button>
                )}
              </div>
            </div>

            <div className="border-b border-border px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {isCheckingBrowser ? (
                    <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/50" />
                  ) : browserStatus?.connected ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                  )}
                  <span className="text-xs text-foreground/80">
                    {isCheckingBrowser
                      ? 'Checking Chrome connection…'
                      : browserStatus?.connected
                        ? `Chrome connected${browserStatus.browser_info?.browser ? ` — ${browserStatus.browser_info.browser}` : ''}`
                        : browserStatus
                          ? 'Chrome not detected'
                          : 'Browser status unknown'}
                  </span>
                </div>
                <button
                  onClick={() => void handleCheckBrowser()}
                  disabled={isCheckingBrowser}
                  className="rounded-md bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground/80 hover:bg-muted disabled:opacity-50"
                >
                  {isCheckingBrowser ? 'Checking…' : 'Re-check'}
                </button>
              </div>

              {!isCheckingBrowser && browserStatus && !browserStatus.connected && (
                <div className="mt-3 rounded-md border border-amber-700/40 bg-amber-950/30 px-3 py-2.5">
                  <p className="mb-1.5 text-xs font-medium text-amber-200">
                    Start Chrome with remote debugging to connect:
                  </p>
                  <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-amber-300">
                    {browserStatus.how_to_start}
                  </pre>
                  <div className="mt-3 space-y-2">
                    <div className="rounded-md border border-border/70 bg-background/70 p-2">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-foreground/80">macOS</span>
                        <button
                          onClick={() => void copyCommand(MACOS_CHROME_DEBUG_COMMAND, 'macOS')}
                          className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground hover:bg-muted"
                        >
                          Copy
                        </button>
                      </div>
                      <code className="block break-all font-mono text-[11px] text-foreground">
                        {MACOS_CHROME_DEBUG_COMMAND}
                      </code>
                    </div>
                    <div className="rounded-md border border-border/70 bg-background/70 p-2">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-foreground/80">Windows</span>
                        <button
                          onClick={() => void copyCommand(WINDOWS_CHROME_DEBUG_COMMAND, 'Windows')}
                          className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground hover:bg-muted"
                        >
                          Copy
                        </button>
                      </div>
                      <code className="block break-all font-mono text-[11px] text-foreground">
                        {WINDOWS_CHROME_DEBUG_COMMAND}
                      </code>
                    </div>
                    <div className="rounded-md border border-border/70 bg-background/70 p-2">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-foreground/80">Verify</span>
                        <button
                          onClick={() => void copyCommand(VERIFY_CDP_COMMAND, 'Verify')}
                          className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground hover:bg-muted"
                        >
                          Copy
                        </button>
                      </div>
                      <code className="block break-all font-mono text-[11px] text-foreground">
                        {VERIFY_CDP_COMMAND}
                      </code>
                    </div>
                  </div>
                  {browserStatus.error && (
                    <p className="mt-1.5 text-[11px] text-amber-400/70">{browserStatus.error}</p>
                  )}
                </div>
              )}
            </div>

            <div className="border-b border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDiscoveryTab('plan')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    discoveryTab === 'plan'
                      ? 'bg-blue-600 text-white'
                      : 'bg-muted text-foreground/80 hover:bg-muted'
                  }`}
                >
                  Plan
                </button>
                <button
                  onClick={() => setDiscoveryTab('agent')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    discoveryTab === 'agent'
                      ? 'bg-blue-600 text-white'
                      : 'bg-muted text-foreground/80 hover:bg-muted'
                  }`}
                >
                  Agent Log
                </button>
                <button
                  onClick={() => setDiscoveryTab('chat')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    discoveryTab === 'chat'
                      ? 'bg-blue-600 text-white'
                      : 'bg-muted text-foreground/80 hover:bg-muted'
                  }`}
                >
                  Chat
                </button>
                {isDiscovering && (
                  <button
                    onClick={() => void handleStopDiscovery()}
                    className="ml-1 flex items-center gap-1.5 rounded-md bg-red-900/80 px-2.5 py-1.5 text-xs font-medium text-red-200 hover:bg-red-800"
                  >
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                    Stop
                  </button>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {discoveryProgress
                    ? `${discoveryProgress.status} • ${discoveryRuntimeLabel}`
                    : isDiscovering
                      ? 'running'
                      : 'idle'}
                </span>
              </div>
            </div>

            <div className="space-y-4 px-5 py-4">
              {discoveryTab === 'plan' ? (
                <>
                  {isPlanningDiscovery ? (
                    <div className="rounded-md border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                      Loading your profile roles…
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Role selector */}
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Target Role
                        </span>
                        {profileRoles.length > 0 ? (
                          <select
                            value={selectedRoleIndex}
                            onChange={(e) => handleRoleChange(Number(e.target.value))}
                            disabled={isDiscovering}
                            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground disabled:opacity-60"
                          >
                            {profileRoles.map((role, idx) => (
                              <option key={idx} value={idx}>
                                {role}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                            {autoDiscoveryPlan?.role ?? 'software engineer'}
                            <span className="ml-2 text-[11px] text-muted-foreground">(add roles in your profile to unlock selector)</span>
                          </div>
                        )}
                      </label>

                      {/* Editable query */}
                      <label className="block">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            LinkedIn Search Query
                          </span>
                          {queryEdited && (
                            <button
                              onClick={() => {
                                const plan = autoDiscoveryPlan;
                                if (plan) {
                                  const autoQ = `${profileRoles[selectedRoleIndex] ?? plan.role} ${plan.locationHint}`.replace(/\s+/g, ' ').trim();
                                  setCustomQuery(autoQ);
                                }
                                setQueryEdited(false);
                              }}
                              className="text-[11px] text-blue-400 hover:text-blue-300"
                            >
                              Reset to auto
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          value={customQuery}
                          onChange={(e) => {
                            setCustomQuery(e.target.value);
                            setQueryEdited(true);
                          }}
                          disabled={isDiscovering}
                          placeholder="e.g. software engineer toronto"
                          className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          This is sent directly to LinkedIn Jobs search. Location hint: <span className="text-muted-foreground">{autoDiscoveryPlan?.locationHint ?? '—'}</span>
                        </p>
                      </label>
                    </div>
                  )}

                  <div className="grid gap-2 md:grid-cols-2">
                    {(discoveryProgress?.source_results ?? autoDiscoveryPlan?.sources ?? []).map((item) => {
                      const source =
                        typeof item === 'string'
                          ? item
                          : String((item as { source?: string }).source ?? 'unknown');
                      const status =
                        typeof item === 'string'
                          ? 'pending'
                          : String((item as { status?: string }).status ?? 'pending');
                      const jobsFound =
                        typeof item === 'string'
                          ? 0
                          : Number((item as { jobs_found?: number }).jobs_found ?? 0);
                      const jobsNew =
                        typeof item === 'string'
                          ? 0
                          : Number((item as { jobs_new?: number }).jobs_new ?? 0);
                      const error =
                        typeof item === 'string'
                          ? null
                          : (item as { error?: string | null }).error ?? null;
                      return (
                        <div key={source} className="rounded-md border border-border bg-background/60 p-2.5 text-xs">
                          <p className="font-medium uppercase tracking-wide text-foreground">{source}</p>
                          <p className="mt-1 text-muted-foreground">
                            Status: <span className="text-foreground">{status}</span>
                          </p>
                          <p className="text-muted-foreground">
                            Extracted: <span className="text-foreground">{jobsFound}</span> • Imported:{' '}
                            <span className="text-foreground">{jobsNew}</span>
                          </p>
                          {error && <p className="mt-1 text-red-400/90">{error}</p>}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : discoveryTab === 'agent' ? (
                <div className="max-h-[44vh] overflow-auto rounded-lg border border-border bg-background px-3 py-2">
                  {(discoveryProgress?.events ?? []).length === 0 ? (
                    <p className="py-3 text-xs text-muted-foreground">Waiting for agent activity…</p>
                  ) : (
                    <div className="space-y-2">
                      {(discoveryProgress?.events ?? []).map((event, idx) => (
                        <div key={`${event.at}-${idx}`} className="rounded border border-border px-2 py-1.5 text-xs">
                          <p className="text-foreground">{event.message}</p>
                          <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {event.level} • {event.at}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col" style={{ height: '44vh' }}>
                  <div className="flex-1 overflow-y-auto rounded-lg border border-border bg-background p-3 space-y-3">
                    {discoveryMessages.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        Send guidance while the search is running. Example: "skip indeed", "focus internships", "stop".
                      </p>
                    ) : (
                      discoveryMessages.map((msg, idx) => (
                        <div
                          key={`${msg.at}-${idx}`}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                              msg.role === 'user'
                                ? 'rounded-br-sm bg-blue-600 text-white'
                                : 'rounded-bl-sm border border-border bg-muted text-foreground'
                            }`}
                          >
                            {msg.role === 'ai' && (
                              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                AI Agent
                              </p>
                            )}
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                            <p className={`mt-1 text-[10px] ${msg.role === 'user' ? 'text-blue-200' : 'text-muted-foreground'}`}>
                              {new Date(msg.at).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={discoveryChatEndRef} />
                  </div>
                  <div className="mt-2 flex items-end gap-2">
                    <textarea
                      value={discoveryChatInput}
                      onChange={(event) => setDiscoveryChatInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void handleSendDiscoveryChat();
                        }
                      }}
                      placeholder="Send guidance to the running agent…"
                      rows={2}
                      className="flex-1 resize-none rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => void handleSendDiscoveryChat()}
                      disabled={isSendingDiscoveryChat || !discoveryChatInput.trim()}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSendingDiscoveryChat ? '…' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <button
                onClick={() => setShowDiscoveryModal(false)}
                className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isDiscovering ? 'Close' : 'Cancel'}
              </button>
              <button
                onClick={() => setDiscoveryTab('chat')}
                disabled={!isDiscovering && !discoveryRunId}
                className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
              >
                Chat with Agent
              </button>
              <button
                onClick={() => void handleBrowserAssistedDiscovery()}
                disabled={
                  isDiscovering ||
                  isPlanningDiscovery ||
                  !browserStatus?.connected
                }
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isDiscovering ? 'Searching…' : 'Run Auto Search'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isRunningFill && runningDraftId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-5xl rounded-xl border border-border bg-card shadow-2xl">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">AI Browser Operation In Progress</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {useVisibleBrowser
                  ? 'Agent is connected to your local Chrome via CDP. Intervene directly in that Chrome window at any time.'
                  : 'Agent is running in managed browser mode. Watch screenshots and operator logs below.'}
              </p>
              {useVisibleBrowser && (
                <div className="mt-2 rounded-md border border-border bg-background/70 px-3 py-2 text-xs text-foreground/80">
                  Keep your Chrome window open with remote debugging on port 9222.
                  The agent will operate that same session live.
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <button
                onClick={() => setRunningTab('agent')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  runningTab === 'agent'
                    ? 'bg-blue-600 text-white'
                    : 'bg-muted text-foreground/80 hover:bg-muted'
                }`}
              >
                Agent Log
              </button>
              <button
                onClick={() => setRunningTab('chat')}
                className={`relative rounded-md px-3 py-1.5 text-xs font-medium ${
                  runningTab === 'chat'
                    ? 'bg-blue-600 text-white'
                    : 'bg-muted text-foreground/80 hover:bg-muted'
                }`}
              >
                Chat
                {chatMessages.length > 0 && runningTab !== 'chat' && (
                  <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-[9px] text-white">
                    {chatMessages.filter((m) => m.role === 'ai').length}
                  </span>
                )}
              </button>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {runningProgress
                  ? `${runningProgress.status} • ${prettyPhase(runningProgress.phase)}`
                  : 'running'}
              </span>
            </div>

            <div className="px-5 py-4">
              {runningProgress?.waiting_for_user && (
                <div className="mb-3 rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                  <p className="font-medium">
                    User action required{prettyUserAction(runningProgress.required_user_action)
                      ? `: ${prettyUserAction(runningProgress.required_user_action)}`
                      : ''}
                  </p>
                  {runningProgress.required_user_action_detail && (
                    <p className="mt-1 text-amber-300/90">{runningProgress.required_user_action_detail}</p>
                  )}
                </div>
              )}
              {runningTab === 'agent' ? (
                <div className="max-h-[52vh] overflow-auto rounded-lg border border-border bg-background px-3 py-2">
                  {(runningProgress?.events ?? []).length === 0 ? (
                    <p className="py-3 text-xs text-muted-foreground">Waiting for agent events...</p>
                  ) : (
                    <div className="space-y-2">
                      {(runningProgress?.events ?? []).map((event, idx) => (
                        <div key={`${event.at}-${idx}`} className="rounded border border-border px-2 py-1.5 text-xs">
                          <p className="text-foreground">{event.message}</p>
                          <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {event.level} • {event.at}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Chat panel */
                <div className="flex flex-col" style={{ height: '52vh' }}>
                  {/* Message thread */}
                  <div className="flex-1 overflow-y-auto rounded-lg border border-border bg-background p-3 space-y-3">
                    {chatMessages.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        The AI will send messages here when it needs your input.
                      </p>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div
                          key={`${msg.at}-${idx}`}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                              msg.role === 'user'
                                ? 'rounded-br-sm bg-blue-600 text-white'
                                : 'rounded-bl-sm border border-border bg-muted text-foreground'
                            }`}
                          >
                            {msg.role === 'ai' && (
                              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                AI Agent
                              </p>
                            )}
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                            <p className={`mt-1 text-[10px] ${msg.role === 'user' ? 'text-blue-200' : 'text-muted-foreground'}`}>
                              {new Date(msg.at).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Input bar */}
                  <div className="mt-2 flex items-end gap-2">
                    <textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendChat();
                        }
                      }}
                      placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                      rows={2}
                      className="flex-1 resize-none rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => void handleSendChat()}
                      disabled={isSendingChat || !chatInput.trim()}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSendingChat ? '…' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              {runningJobUrl && (
                <a
                  href={runningJobUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                >
                  Open Job Page
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {assistedReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-5xl rounded-xl border border-border bg-card shadow-2xl">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">Review Browser Activity</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {useVisibleBrowser
                  ? 'AI-assisted fill completed. Submit in your browser, then confirm here.'
                  : 'AI-assisted fill completed. Validate the result, then trigger final submit.'}
              </p>
            </div>

            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <button
                onClick={() => setReviewTab('agent')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  reviewTab === 'agent'
                    ? 'bg-blue-600 text-white'
                    : 'bg-muted text-foreground/80 hover:bg-muted'
                }`}
              >
                Agent Log
              </button>
              <button
                onClick={() => setReviewTab('chat')}
                className={`relative rounded-md px-3 py-1.5 text-xs font-medium ${
                  reviewTab === 'chat'
                    ? 'bg-blue-600 text-white'
                    : 'bg-muted text-foreground/80 hover:bg-muted'
                }`}
              >
                Chat
                {chatMessages.length > 0 && reviewTab !== 'chat' && (
                  <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-[9px] text-white">
                    {chatMessages.filter((m) => m.role === 'ai').length}
                  </span>
                )}
              </button>
            </div>

            <div className="space-y-3 px-5 py-4">
              {reviewTab === 'agent' ? (
                <div className="max-h-[52vh] overflow-auto rounded-lg border border-border bg-background px-3 py-2">
                  {assistedReview.events.length === 0 ? (
                    <p className="py-3 text-xs text-muted-foreground">No agent events captured.</p>
                  ) : (
                    <div className="space-y-2">
                      {assistedReview.events.map((event, idx) => (
                        <div key={`${event.at}-${idx}`} className="rounded border border-border px-2 py-1.5 text-xs">
                          <p className="text-foreground">{event.message}</p>
                          <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {event.level} • {event.at}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col" style={{ height: '52vh' }}>
                  <div className="flex-1 overflow-y-auto rounded-lg border border-border bg-background p-3 space-y-3">
                    {chatMessages.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">No chat messages from this session.</p>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div
                          key={`${msg.at}-${idx}`}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                              msg.role === 'user'
                                ? 'rounded-br-sm bg-blue-600 text-white'
                                : 'rounded-bl-sm border border-border bg-muted text-foreground'
                            }`}
                          >
                            {msg.role === 'ai' && (
                              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                AI Agent
                              </p>
                            )}
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                            <p className={`mt-1 text-[10px] ${msg.role === 'user' ? 'text-blue-200' : 'text-muted-foreground'}`}>
                              {new Date(msg.at).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="mt-2 flex items-end gap-2">
                    <textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendChat();
                        }
                      }}
                      placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                      rows={2}
                      className="flex-1 resize-none rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => void handleSendChat()}
                      disabled={isSendingChat || !chatInput.trim()}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSendingChat ? '…' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <button
                onClick={handleEndChat}
                className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-muted"
              >
                End Chat
              </button>
              <button
                onClick={() => void handleFinalSubmit()}
                disabled={isSubmittingFinal}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmittingFinal
                  ? 'Submitting...'
                  : useVisibleBrowser
                    ? 'I Submitted in Browser'
                    : 'Final Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
