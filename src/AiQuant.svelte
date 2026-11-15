<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import {
    AlertTriangle,
    ArrowUp,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Code2,
    Copy,
    ExternalLink,
    FileCode2,
    History,
    Loader2,
    MessageSquare,
    MoreVertical,
    PenSquare,
    Plus,
    RotateCcw,
    Sparkles,
    Square,
    Wrench,
    X,
  } from 'lucide-svelte';
  import type { Vela } from '@luxalgo/vela';
  import appIcon from '../src-tauri/icons/icon.png';
  import type { SavedScript } from './pine/library';
  import {
    type AiQuantImageAttachment,
    MAX_ATTACHMENTS_PER_PROMPT,
    readFileAsAttachment,
  } from './ai-quant/image-validation';
  import {
    type AiQuantStatusResponse,
    type AiQuantTransport,
    type PineVersion,
    createDefaultAiQuantTransport,
    parseIndicatorNameFromSource,
  } from './ai-quant/deepseek-client';
  import {
    type PipelineProgressEvent,
    runAutonomousPipeline,
  } from './ai-quant/compiler-pipeline';
  import {
    generateContextualFollowUps,
    highlightPineSourceLines,
  } from './ai-quant/pine-highlight';
  import {
    type AiQuantSession,
    createEmptySession,
    readAiQuantState,
    recordFailedBuild,
    recordSuccessfulBuild,
    restoreSessionVersion,
    upsertSavedScriptInList,
    writeAiQuantState,
  } from './ai-quant/store';

  export let chart: Vela | undefined;
  export let activeSymbol = 'XAUUSD';
  export let activeTimeframe = '15m';
  export let scripts: SavedScript[] = [];
  export let persistScripts: (next: SavedScript[]) => void = () => {};
  export let onInspectInPineEditor: (script: SavedScript) => void = () => {};
  export let onSyncPineEditor: (script: SavedScript) => void = () => {};
  export let onClose: () => void = () => {};
  export let transport: AiQuantTransport = createDefaultAiQuantTransport();

  let panelWidth = 356;
  let sessions: AiQuantSession[] = [];
  let activeSessionId: string | null = null;
  let activeTab: 'chat' | 'all_chats' = 'chat';
  let promptText = '';
  let selectedVersionMode: 'auto' | 'v6' | 'v5' = 'auto';
  let attachments: AiQuantImageAttachment[] = [];
  let attachmentError = '';
  let busy = false;
  let pendingUserPrompt = '';
  let pendingImageNames: string[] = [];
  let elapsedSeconds = 0;
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;
  let progressEvent: PipelineProgressEvent | null = null;
  let streamingPreview = '';
  let rawStreamBuffer = '';
  let repairEventsLog: Array<{ attempt: number; maxAttempts: number; summary: string }> = [];
  let showHistory = false;
  let showCodeInspect = false;
  let copiedId = '';
  let apiStatus: AiQuantStatusResponse | null = null;
  let activeAbortController: AbortController | null = null;
  let fileInput: HTMLInputElement;
  let conversationEl: HTMLDivElement;

  const starterSuggestions = [
    'Build an institutional supply and demand indicator with confirmed market structure and visibility settings.',
    'Build a liquidity sweep indicator with Asia and London session highs and lows.',
    'Build an Order Block + EMA 50 confluence indicator with bullish and bearish labels.',
  ];

  $: activeSession =
    sessions.find((s) => s.id === activeSessionId) ??
    sessions[0] ??
    null;

  $: activeWorkingSource =
    activeSession?.currentSource ||
    (activeSession && activeSession.versions.length > 0
      ? activeSession.versions[activeSession.versions.length - 1]?.source
      : '') ||
    activeSession?.previousWorkingSource ||
    '';

  $: activeVersionNumber =
    activeSession?.versions.find((v) => v.id === activeSession.activeVersionId)?.versionNumber ??
    (activeSession && activeSession.versions.length > 0
      ? activeSession.versions[activeSession.versions.length - 1]?.versionNumber
      : null) ??
    null;

  $: headerChatTitle =
    activeSession && activeWorkingSource && activeSession.name !== 'New Indicator'
      ? activeSession.name
      : 'Chat';

  $: dynamicFollowUps =
    activeSession && activeWorkingSource
      ? generateContextualFollowUps(activeWorkingSource, activeSession.name)
      : [
          'Add visibility toggles for individual sessions and zones',
          'Highlight high-confluence zones with distinct border styling',
          'Add alert conditions for confirmed bullish and bearish signals',
        ];

  $: highlightedStream = highlightPineSourceLines(rawStreamBuffer, { maxTailLines: 8 });
  $: highlightedInspect = highlightPineSourceLines(activeWorkingSource);
  $: isCodeStreaming = highlightedStream.totalLines > 0;
  $: liveScriptTitle = isCodeStreaming
    ? parseIndicatorNameFromSource(
        rawStreamBuffer,
        activeSession && activeSession.name !== 'New Indicator'
          ? activeSession.name
          : 'Market Structure & Indicator',
      )
    : activeSession && activeSession.name !== 'New Indicator'
      ? activeSession.name
      : 'Plan';
  $: liveFooterStatus = !progressEvent
    ? 'Thinking'
    : progressEvent.stage === 'repair'
      ? `Repairing logic (${progressEvent.attempt}/${progressEvent.maxAttempts})`
      : progressEvent.stage === 'validate' || progressEvent.stage === 'compile' || progressEvent.stage === 'execute'
        ? 'Verifying & compiling'
        : progressEvent.stage === 'install'
          ? 'Applying to chart'
          : isCodeStreaming
            ? 'Building the logic'
            : 'Thinking';

  onDestroy(() => {
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
  });

  onMount(() => {
    const loaded = readAiQuantState(typeof localStorage !== 'undefined' ? localStorage : null);
    if (loaded.sessions.length > 0) {
      sessions = loaded.sessions;
      activeSessionId = loaded.activeSessionId ?? loaded.sessions[0].id;
    } else {
      const initial = createEmptySession('New Indicator');
      sessions = [initial];
      activeSessionId = initial.id;
      saveState();
    }
    void refreshApiStatus();
  });

  export async function refreshApiStatus() {
    try {
      apiStatus = await transport.getStatus();
    } catch (err) {
      apiStatus = {
        configured: false,
        model: 'deepseek-flash',
        baseUrl: 'https://api.deepseek.com',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  function saveState() {
    if (typeof localStorage === 'undefined') return;
    writeAiQuantState(localStorage, {
      version: 1,
      activeSessionId,
      sessions,
    });
  }

  function startNewIndicator() {
    if (busy) return;
    const fresh = createEmptySession('New Indicator');
    sessions = [fresh, ...sessions];
    activeSessionId = fresh.id;
    activeTab = 'chat';
    showHistory = false;
    showCodeInspect = false;
    attachmentError = '';
    saveState();
  }

  function selectSession(id: string) {
    if (busy) return;
    activeSessionId = id;
    activeTab = 'chat';
    showHistory = false;
    attachmentError = '';
    saveState();
    void scrollToBottom();
  }

  async function scrollToBottom() {
    await tick();
    if (conversationEl) {
      conversationEl.scrollTop = conversationEl.scrollHeight;
    }
  }

  function summarizeDiagnostic(rawDetail?: string): string {
    if (!rawDetail) return 'Adjusting Pine Script syntax and re-verifying on chart bars...';
    const firstLine = rawDetail.split(/\r?\n/)[0].trim();
    const cleaned = firstLine
      .replace(/^Stage\s+\d+\s*\([^)]+\)\s*:\s*/i, '')
      .trim();
    return cleaned.length > 120 ? `${cleaned.slice(0, 117)}...` : cleaned;
  }

  async function handleFilesSelected(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    attachmentError = '';
    const list = Array.from(files);
    for (const file of list) {
      try {
        const encoded = await readFileAsAttachment(file, attachments.length);
        attachments = [...attachments, encoded];
      } catch (err) {
        attachmentError = err instanceof Error ? err.message : String(err);
        break;
      }
    }
    if (fileInput) {
      fileInput.value = '';
    }
  }

  function removeAttachment(id: string) {
    attachments = attachments.filter((a) => a.id !== id);
    attachmentError = '';
  }

  function handlePaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      event.preventDefault();
      void handleFilesSelected(imageFiles);
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    if (busy) return;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      void handleFilesSelected(files);
    }
  }

  function stopGeneration() {
    if (activeAbortController) {
      activeAbortController.abort();
    }
  }

  async function copyCurrentSource(msgId: string) {
    if (!activeWorkingSource) return;
    try {
      await navigator.clipboard.writeText(activeWorkingSource);
      copiedId = msgId;
      setTimeout(() => {
        if (copiedId === msgId) copiedId = '';
      }, 1800);
    } catch {
      /* ignore clipboard error */
    }
  }

  async function submitPrompt(overridePrompt?: string) {
    if (busy) return;
    const rawPrompt = typeof overridePrompt === 'string' ? overridePrompt : promptText;
    const trimmed = rawPrompt.trim();
    if (!trimmed && attachments.length === 0) return;

    await refreshApiStatus();
    if (!activeSession) {
      const fresh = createEmptySession('New Indicator');
      sessions = [fresh];
      activeSessionId = fresh.id;
    }
    const currentSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
    if (!currentSession) return;

    // Resolve any existing indicator source from currentSource, latest version, or previousWorkingSource
    // so follow-up prompts are ALWAYS treated as continuations/improvements of the active indicator
    const latestSource =
      currentSession.currentSource ||
      (currentSession.versions.length > 0
        ? currentSession.versions[currentSession.versions.length - 1]?.source
        : '') ||
      currentSession.previousWorkingSource ||
      '';

    const currentImages = [...attachments];
    if (typeof overridePrompt !== 'string') {
      promptText = '';
    }
    attachments = [];
    attachmentError = '';
    activeTab = 'chat';
    busy = true;
    pendingUserPrompt = trimmed || `Attached ${currentImages.length} reference image(s)`;
    pendingImageNames = currentImages.map((i) => i.name);
    elapsedSeconds = 0;
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = setInterval(() => {
      elapsedSeconds += 1;
    }, 1000);
    streamingPreview = '';
    rawStreamBuffer = '';
    repairEventsLog = [];
    progressEvent = {
      stage: 'understand',
      label: latestSource
        ? `Analyzing continuation request for ${currentSession.name}...`
        : 'Understanding indicator requirements...',
      attempt: 0,
      maxAttempts: 5,
    };
    activeAbortController = new AbortController();
    void scrollToBottom();

    const requestedVersion: PineVersion | undefined =
      selectedVersionMode === 'v5' ? 5 : selectedVersionMode === 'v6' ? 6 : undefined;

    try {
      const conversationHistory = currentSession.messages
        .filter((m) => m.status === 'complete' || m.status === 'clarification')
        .map((m) => ({
          role: m.role,
          text: m.text,
        }));

      const existingIndicator = latestSource
        ? {
            name: currentSession.name,
            source: latestSource,
            pineVersion: currentSession.pineVersion,
            originalRequirements:
              currentSession.originalRequirements || trimmed || 'Visual reference indicator',
          }
        : null;

      const result = await runAutonomousPipeline({
        indicatorId: currentSession.id,
        prompt: trimmed,
        images: currentImages,
        requestedVersion,
        existingIndicator,
        conversationHistory,
        chart: chart ?? null,
        transport,
        onProgress: (ev) => {
          progressEvent = ev;
          if (ev.stage === 'repair' && ev.attempt > 0) {
            rawStreamBuffer = '';
            streamingPreview = '';
            const summary = summarizeDiagnostic(ev.detail);
            if (!repairEventsLog.some((r) => r.attempt === ev.attempt)) {
              repairEventsLog = [
                ...repairEventsLog,
                { attempt: ev.attempt, maxAttempts: ev.maxAttempts, summary },
              ];
            }
          }
          void scrollToBottom();
        },
        onStreamDelta: (_delta, accumulated) => {
          rawStreamBuffer = accumulated;
          const lines = accumulated.trim().split(/\r?\n/);
          streamingPreview = lines.slice(-8).join('\n');
        },
        signal: activeAbortController.signal,
      });

      if (result.ok && result.clarificationQuestion) {
        const now = new Date().toISOString();
        const updated: AiQuantSession = {
          ...currentSession,
          messages: [
            ...currentSession.messages,
            {
              id: `u-${Date.now()}`,
              role: 'user',
              text: trimmed || `Attached ${currentImages.length} reference image(s)`,
              imageNames: currentImages.map((i) => i.name),
              imageCount: currentImages.length,
              createdAt: now,
              status: 'complete',
            },
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              text: result.clarificationQuestion,
              createdAt: now,
              status: 'clarification',
            },
          ],
          updatedAt: now,
        };
        sessions = sessions.map((s) => (s.id === currentSession.id ? updated : s));
        saveState();
      } else if (result.ok && result.source) {
        const { updatedSession, savedScript } = recordSuccessfulBuild(currentSession, {
          userPrompt: trimmed,
          imageNames: currentImages.map((i) => i.name),
          indicatorName: result.name,
          pineVersion: result.pineVersion,
          source: result.source,
          completionMessage: result.completionMessage,
          repairAttemptsUsed: result.repairAttemptsUsed,
        });
        sessions = sessions.map((s) => (s.id === currentSession.id ? updatedSession : s));
        saveState();

        const nextScripts = upsertSavedScriptInList(scripts, savedScript);
        persistScripts(nextScripts);
        onSyncPineEditor(savedScript);
      } else {
        const failedSession = recordFailedBuild(currentSession, {
          userPrompt: trimmed,
          imageNames: currentImages.map((i) => i.name),
          errorMessage: result.error || 'Indicator generation failed.',
          repairAttemptsUsed: result.repairAttemptsUsed,
        });
        sessions = sessions.map((s) => (s.id === currentSession.id ? failedSession : s));
        saveState();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const failedSession = recordFailedBuild(currentSession, {
        userPrompt: trimmed,
        imageNames: currentImages.map((i) => i.name),
        errorMessage: msg,
        repairAttemptsUsed: 0,
      });
      sessions = sessions.map((s) => (s.id === currentSession.id ? failedSession : s));
      saveState();
    } finally {
      busy = false;
      pendingUserPrompt = '';
      pendingImageNames = [];
      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
      progressEvent = null;
      streamingPreview = '';
      rawStreamBuffer = '';
      repairEventsLog = [];
      activeAbortController = null;
      void scrollToBottom();
    }
  }

  async function handleRestoreVersion(versionId: string) {
    if (busy || !activeSession) return;
    busy = true;
    try {
      const { updatedSession, savedScript } = await restoreSessionVersion(activeSession, versionId, {
        chart: chart ?? null,
      });
      sessions = sessions.map((s) => (s.id === activeSession.id ? updatedSession : s));
      saveState();
      const nextScripts = upsertSavedScriptInList(scripts, savedScript);
      persistScripts(nextScripts);
      onSyncPineEditor(savedScript);
      showHistory = false;
      activeTab = 'chat';
      void scrollToBottom();
    } catch (err) {
      attachmentError = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  function inspectCurrentCodeInPineEditor() {
    if (!activeSession || !activeWorkingSource) return;
    const savedScript: SavedScript = {
      id: activeSession.id,
      name: activeSession.name,
      source: activeWorkingSource,
      updatedAt: activeSession.updatedAt,
    };
    onInspectInPineEditor(savedScript);
  }

  function cycleVersionMode() {
    if (selectedVersionMode === 'auto') selectedVersionMode = 'v6';
    else if (selectedVersionMode === 'v6') selectedVersionMode = 'v5';
    else selectedVersionMode = 'auto';
  }

  function startResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    const move = (ev: MouseEvent) => {
      panelWidth = Math.max(290, Math.min(560, startW + (startX - ev.clientX)));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitPrompt();
    } else if (event.key === 'Tab' && !promptText.trim() && (!activeSession || activeSession.messages.length === 0)) {
      event.preventDefault();
      promptText = starterSuggestions[0];
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<aside
  class="ai-quant-panel"
  style="width: {panelWidth}px"
  aria-label="AI Quant"
  on:dragover|preventDefault
  on:drop={handleDrop}
>
  <div class="resizer" on:mousedown={startResize}></div>

  <!-- Top Segmented Header Bar (Chat / All chats + Actions) -->
  <header class="aq-header">
    <div class="aq-tab-strip" role="tablist" aria-label="AI Quant views">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'chat'}
        class="aq-tab-pill"
        class:active={activeTab === 'chat'}
        title={headerChatTitle}
        on:click={() => {
          activeTab = 'chat';
        }}
      >
        <Sparkles size={13} strokeWidth={1.9} class="aq-tab-icon" />
        <span class="aq-tab-label">{headerChatTitle}</span>
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'all_chats'}
        class="aq-tab-pill"
        class:active={activeTab === 'all_chats'}
        title="All indicator chats and versions"
        on:click={() => {
          activeTab = activeTab === 'all_chats' ? 'chat' : 'all_chats';
        }}
      >
        <MessageSquare size={13} strokeWidth={1.8} class="aq-tab-icon" />
        <span class="aq-tab-label">All chats</span>
      </button>
    </div>

    <div class="aq-header-actions">
      {#if activeSession && activeSession.versions.length > 0}
        <button
          type="button"
          class="aq-icon-btn"
          class:active={showHistory}
          title="Indicator Version History"
          aria-label="Indicator Version History"
          on:click={() => {
            showHistory = !showHistory;
            if (showHistory) showCodeInspect = false;
          }}
        >
          <History size={14} strokeWidth={1.8} />
        </button>
      {/if}

      {#if activeSession && activeWorkingSource}
        <button
          type="button"
          class="aq-icon-btn"
          class:active={showCodeInspect}
          title="Inspect Generated Pine Script"
          aria-label="Inspect Generated Pine Script"
          on:click={() => {
            showCodeInspect = !showCodeInspect;
            if (showCodeInspect) showHistory = false;
          }}
        >
          <Code2 size={14} strokeWidth={1.8} />
        </button>
      {:else}
        <button
          type="button"
          class="aq-icon-btn"
          title="New Indicator Chat"
          aria-label="New Indicator"
          disabled={busy}
          on:click={startNewIndicator}
        >
          <MoreVertical size={14} strokeWidth={1.8} />
        </button>
      {/if}

      <button
        type="button"
        class="aq-icon-btn"
        title="Close AI Quant"
        aria-label="Close AI Quant"
        on:click={onClose}
      >
        <X size={15} strokeWidth={1.8} />
      </button>
    </div>
  </header>

  <!-- Hidden Session Select for accessibility & programmatic selection -->
  {#if sessions.length > 1}
    <select
      class="aq-sr-only"
      aria-label="Active AI Quant Indicator"
      value={activeSession?.id ?? ''}
      disabled={busy}
      on:change={(e) => selectSession((e.currentTarget as HTMLSelectElement).value)}
    >
      {#each sessions as session (session.id)}
        <option value={session.id}>
          {session.name}{session.versions.length > 0 ? ` (v${session.versions[session.versions.length - 1]?.versionNumber})` : ''}
        </option>
      {/each}
    </select>
  {/if}

  <!-- Missing API Configuration Notice -->
  {#if apiStatus && !apiStatus.configured}
    <div class="aq-config-warning" role="status">
      <AlertTriangle size={13} strokeWidth={1.9} />
      <span>{apiStatus.error || 'Add DEEPSEEK_API_KEY to your local .env file to enable AI Quant.'}</span>
    </div>
  {/if}

  <!-- Collapsible Version History Drawer -->
  {#if showHistory && activeSession && activeSession.versions.length > 0}
    <section class="aq-drawer" aria-label="Indicator Version History">
      <div class="aq-drawer-head">
        <span>Version History ({activeSession.versions.length})</span>
        <button type="button" class="aq-drawer-close" on:click={() => (showHistory = false)}>
          <X size={12} />
        </button>
      </div>
      <div class="aq-version-list">
        {#each [...activeSession.versions].reverse() as ver (ver.id)}
          <div class="aq-version-row" class:current={ver.id === activeSession.activeVersionId}>
            <div class="aq-version-meta">
              <div class="aq-version-title">
                <strong>v{ver.versionNumber}</strong>
                <span>Pine v{ver.pineVersion}</span>
                {#if ver.id === activeSession.activeVersionId}
                  <span class="aq-active-tag">Active</span>
                {/if}
              </div>
              <p class="aq-version-summary">{ver.promptSummary}</p>
            </div>
            {#if ver.id !== activeSession.activeVersionId}
              <button
                type="button"
                class="aq-restore-btn"
                disabled={busy}
                title="Restore v{ver.versionNumber} to chart"
                on:click={() => handleRestoreVersion(ver.id)}
              >
                <RotateCcw size={11} strokeWidth={1.8} />
                <span>Restore</span>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Collapsible Syntax-Highlighted Code Inspection Drawer -->
  {#if showCodeInspect && activeSession && activeWorkingSource}
    <section class="aq-drawer aq-code-drawer" aria-label="Compact Code Inspection">
      <div class="aq-drawer-head">
        <span>{activeSession.name} · Pine v{activeSession.pineVersion}</span>
        <div class="aq-drawer-actions">
          <button
            type="button"
            class="aq-open-editor-btn"
            on:click={inspectCurrentCodeInPineEditor}
          >
            <span>Open in Pine Editor</span>
            <ExternalLink size={11} />
          </button>
          <button type="button" class="aq-drawer-close" on:click={() => (showCodeInspect = false)}>
            <X size={12} />
          </button>
        </div>
      </div>
      <div class="aq-code-highlight-box">
        {#each highlightedInspect.lines as line (line.lineNumber)}
          <div class="aq-code-line">
            <span class="aq-line-num">{line.lineNumber}</span>
            <span class="aq-line-code">{@html line.html}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- All Chats & Indicators View -->
  {#if activeTab === 'all_chats'}
    <div class="aq-all-chats">
      <div class="aq-all-chats-header">
        <span>Indicator Sessions</span>
        <button
          type="button"
          class="aq-new-session-btn"
          disabled={busy}
          on:click={startNewIndicator}
        >
          <Plus size={12} strokeWidth={2} />
          <span>New chat</span>
        </button>
      </div>
      <div class="aq-session-list">
        {#each sessions as sess (sess.id)}
          <div
            class="aq-session-card"
            class:selected={sess.id === activeSession?.id}
            role="button"
            tabindex="0"
            on:click={() => selectSession(sess.id)}
            on:keydown={(e) => e.key === 'Enter' && selectSession(sess.id)}
          >
            <div class="aq-session-card-top">
              <strong>{sess.name}</strong>
              {#if sess.versions.length > 0}
                <span class="aq-version-badge">v{sess.versions[sess.versions.length - 1]?.versionNumber}</span>
              {/if}
            </div>
            <p class="aq-session-card-sub">
              {sess.originalRequirements || 'No indicator built yet'}
            </p>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <!-- Main Conversation Area -->
    <div class="aq-conversation" bind:this={conversationEl}>
      {#if (!activeSession || activeSession.messages.length === 0) && !busy}
        <div class="aq-empty-hero">
          <div class="aq-hero-glow"></div>
          <div class="aq-hero-mark" aria-hidden="true">
            <img src={appIcon} alt="DeplyzeView" class="aq-hero-logo" draggable="false" />
          </div>
          <h2 class="aq-hero-title">Where should<br />we start?</h2>
          <p class="aq-hero-subtitle">
            <span class="aq-status-dot"></span>
            <span>Autonomous Pine v6 &amp; v5 engineering. Built, tested, and installed on your chart.</span>
          </p>

          <div class="aq-starter-cards">
            {#each starterSuggestions as suggestion}
              <button
                type="button"
                class="aq-starter-card"
                disabled={busy}
                on:click={() => submitPrompt(suggestion)}
              >
                {suggestion}
              </button>
            {/each}
          </div>
        </div>
      {:else}
        {#if activeSession}
          {#each activeSession.messages as msg, idx (msg.id)}
            {#if msg.role === 'user'}
              <article class="aq-msg aq-msg-user">
                <div class="aq-user-bubble">
                  <p class="aq-msg-text">{msg.text}</p>
                  {#if msg.imageNames && msg.imageNames.length > 0}
                    <div class="aq-msg-attachments">
                      {#each msg.imageNames as imgName}
                        <span class="aq-img-chip">{imgName}</span>
                      {/each}
                    </div>
                  {/if}
                </div>
              </article>
            {:else}
              <article class="aq-msg aq-msg-assistant" class:is-error={msg.status === 'error'}>
                <div class="aq-assistant-flow">
                  <p class="aq-msg-text">{msg.text}</p>

                  {#if msg.status === 'complete' && msg.versionNumber}
                    <div class="aq-telemetry-note">
                      {#if msg.repairAttemptsUsed && msg.repairAttemptsUsed > 0}
                        <span>{msg.repairAttemptsUsed} compile {msg.repairAttemptsUsed === 1 ? 'issue' : 'issues'} automatically repaired during validation.</span>
                      {/if}
                      <span>Installed on active chart · {activeSession.name} (v{msg.versionNumber} · Pine v{activeSession.pineVersion})</span>
                    </div>

                    <!-- Action Toolbar Row -->
                    <div class="aq-action-bar">
                      {#if msg.versionId && msg.versionId !== activeSession.activeVersionId}
                        <button
                          type="button"
                          class="aq-tool-icon"
                          title="Restore v{msg.versionNumber} to chart"
                          disabled={busy}
                          on:click={() => msg.versionId && handleRestoreVersion(msg.versionId)}
                        >
                          <RotateCcw size={13} strokeWidth={1.8} />
                        </button>
                      {:else}
                        <button
                          type="button"
                          class="aq-tool-icon"
                          title="Version History"
                          on:click={() => {
                            showHistory = !showHistory;
                            if (showHistory) showCodeInspect = false;
                          }}
                        >
                          <RotateCcw size={13} strokeWidth={1.8} />
                        </button>
                      {/if}

                      <button
                        type="button"
                        class="aq-tool-icon"
                        title="Copy Pine Script"
                        on:click={() => copyCurrentSource(msg.id)}
                      >
                        {#if copiedId === msg.id}
                          <Check size={13} strokeWidth={2} />
                        {:else}
                          <Copy size={13} strokeWidth={1.8} />
                        {/if}
                      </button>

                      <button
                        type="button"
                        class="aq-tool-icon"
                        class:active={showCodeInspect}
                        title="Inspect Generated Code"
                        on:click={() => {
                          showCodeInspect = !showCodeInspect;
                          if (showCodeInspect) showHistory = false;
                        }}
                      >
                        <Code2 size={13} strokeWidth={1.8} />
                      </button>

                      <button
                        type="button"
                        class="aq-tool-icon"
                        title="Open in Pine Editor"
                        on:click={inspectCurrentCodeInPineEditor}
                      >
                        <ExternalLink size={13} strokeWidth={1.8} />
                      </button>
                    </div>

                    <!-- Follow-up New Chat & Contextual Refinement Cards on Latest Message -->
                    {#if idx === activeSession.messages.length - 1 && !busy}
                      <div class="aq-followup-block">
                        <button
                          type="button"
                          class="aq-new-chat-inline"
                          on:click={startNewIndicator}
                        >
                          <PenSquare size={12} strokeWidth={1.8} />
                          <span>New chat</span>
                        </button>

                        <div class="aq-followup-cards">
                          {#each dynamicFollowUps as followUp}
                            <button
                              type="button"
                              class="aq-followup-card"
                              on:click={() => submitPrompt(followUp)}
                            >
                              {followUp}
                            </button>
                          {/each}
                        </div>
                      </div>
                    {/if}
                  {/if}
                </div>
              </article>
            {/if}
          {/each}
        {/if}

        <!-- Pending User Prompt Bubble (shown immediately when sending first or follow-up prompt) -->
        {#if busy && pendingUserPrompt}
          <article class="aq-msg aq-msg-user">
            <div class="aq-user-bubble">
              <p class="aq-msg-text">{pendingUserPrompt}</p>
              {#if pendingImageNames.length > 0}
                <div class="aq-msg-attachments">
                  {#each pendingImageNames as imgName}
                    <span class="aq-img-chip">{imgName}</span>
                  {/each}
                </div>
              {/if}
            </div>
          </article>
        {/if}
      {/if}

      <!-- LuxAlgo-Style Live Thinking & Code Building Animation Card -->
      {#if busy && progressEvent}
        <div class="aq-live-status aq-lux-card" role="status" aria-live="polite">
          <!-- Card Header: Breadcrumb (Quant > Plan  OR  Scripts > Name ... N lines) -->
          <div class="aq-lux-card-header">
            <div class="aq-lux-breadcrumb">
              {#if isCodeStreaming}
                <FileCode2 size={13} strokeWidth={1.8} class="aq-lux-bc-icon" />
                <span class="aq-lux-bc-root">Scripts</span>
                <ChevronRight size={11} strokeWidth={2} class="aq-lux-bc-sep" />
                <span class="aq-lux-bc-current" title={liveScriptTitle}>{liveScriptTitle}</span>
              {:else}
                <MessageSquare size={13} strokeWidth={1.8} class="aq-lux-bc-icon" />
                <span class="aq-lux-bc-root">Quant</span>
                <ChevronRight size={11} strokeWidth={2} class="aq-lux-bc-sep" />
                <span class="aq-lux-bc-current">
                  {progressEvent.stage === 'repair' ? `Self-Repair (${progressEvent.attempt}/${progressEvent.maxAttempts})` : 'Plan'}
                </span>
              {/if}
            </div>
            {#if isCodeStreaming}
              <span class="aq-lux-line-count">{highlightedStream.totalLines} lines</span>
            {/if}
          </div>

          <!-- Hidden Stepper Pills for structural progress & accessibility -->
          <div class="aq-step-pills aq-sr-only">
            <span class="aq-step-chip" class:active={progressEvent.stage === 'understand' || progressEvent.stage === 'plan'}>Plan</span>
            <span class="aq-step-chip" class:active={progressEvent.stage === 'generate' || progressEvent.stage === 'repair'}>Code</span>
            <span class="aq-step-chip" class:active={['validate', 'compile', 'execute'].includes(progressEvent.stage)}>Compile &amp; Test</span>
            <span class="aq-step-chip" class:active={progressEvent.stage === 'install'}>Install</span>
          </div>

          <!-- Card Body: Plan / Thinking Stage OR Live Syntax-Highlighted Code Window -->
          <div class="aq-lux-card-body">
            {#if isCodeStreaming}
              <pre class="aq-stream-snippet"><div class="aq-code-highlight-box aq-lux-code-box">{#each highlightedStream.lines as line, lineIdx (line.lineNumber)}<div class="aq-code-line" class:is-latest={lineIdx === highlightedStream.lines.length - 1}><span class="aq-line-num">{line.lineNumber}</span><span class="aq-line-pipe" aria-hidden="true">|</span><span class="aq-line-code">{@html line.html}</span></div>{/each}</div></pre>
            {:else}
              <div class="aq-lux-plan-stage">
                <div class="aq-lux-cursor-row">
                  <span class="aq-lux-dash">-</span>
                  <span class="aq-lux-caret"></span>
                </div>
                <div class="aq-lux-ghost-context" aria-hidden="true">
                  <p class="aq-lux-ghost-prompt">{pendingUserPrompt || activeSession?.originalRequirements || 'Autonomous Pine Script Indicator'}</p>
                  <div class="aq-lux-ghost-meta">
                    <span class="aq-lux-ghost-tag">Trading</span>
                    <span class="aq-lux-ghost-market">{activeSymbol} · {activeTimeframe}</span>
                  </div>
                </div>
              </div>
            {/if}

            <!-- Self-Repair Diagnostic Overlay if repairing -->
            {#if repairEventsLog.length > 0}
              <div class="aq-repair-timeline">
                {#each repairEventsLog.slice(-1) as rep (rep.attempt)}
                  <div class="aq-repair-card">
                    <div class="aq-repair-card-head">
                      <Wrench size={11} strokeWidth={2} />
                      <strong>Auto-fixing diagnostic (Attempt {rep.attempt}/{rep.maxAttempts})</strong>
                    </div>
                    <p class="aq-repair-card-detail">{rep.summary}</p>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Card Footer: Glowing Orb + Shimmering Status Text + Pine Script® + Elapsed Timer -->
          <div class="aq-lux-card-footer">
            <div class="aq-lux-footer-left">
              <span class="aq-lux-orb" aria-hidden="true"></span>
              <span class="aq-lux-status-shimmer">{liveFooterStatus}</span>
            </div>
            <div class="aq-lux-footer-right">
              {#if isCodeStreaming || ['validate', 'compile', 'execute', 'install'].includes(progressEvent.stage)}
                <span class="aq-lux-pine-badge">Pine Script®</span>
              {/if}
              <span class="aq-lux-elapsed">{elapsedSeconds}s</span>
            </div>
          </div>
        </div>
      {/if}
      <!-- New Chat Shortcut Above Composer While Generating -->
      {#if busy}
        <div class="aq-busy-new-chat-row">
          <button
            type="button"
            class="aq-new-chat-inline"
            on:click={() => {
              stopGeneration();
              startNewIndicator();
            }}
          >
            <PenSquare size={12} strokeWidth={1.8} />
            <span>New chat</span>
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Bottom Pill Composer -->
  <footer class="aq-composer">
    {#if attachmentError}
      <div class="aq-attachment-error" role="alert">
        <span>{attachmentError}</span>
        <button type="button" on:click={() => (attachmentError = '')}><X size={11} /></button>
      </div>
    {/if}

    <div class="aq-pill-box">
      <!-- Continuation Context Indicator when refining an existing indicator -->
      {#if activeSession && activeWorkingSource && !busy}
        <div class="aq-continuation-bar">
          <span class="aq-continuation-label">
            <CheckCircle2 size={11} strokeWidth={2} class="aq-cont-icon" />
            <span>Refining <strong>{activeSession.name}</strong>{activeVersionNumber ? ` (v${activeVersionNumber})` : ''}</span>
          </span>
          <button
            type="button"
            class="aq-cont-new-btn"
            disabled={busy}
            title="Start a separate indicator chat"
            on:click={startNewIndicator}
          >
            + New
          </button>
        </div>
      {/if}

      {#if attachments.length > 0}
        <div class="aq-preview-strip" aria-label="Attached reference images">
          {#each attachments as att (att.id)}
            <div class="aq-preview-item">
              <img src={att.dataUrl} alt={att.name} class="aq-preview-thumb" />
              <span class="aq-preview-name" title={att.name}>{att.name}</span>
              <button
                type="button"
                class="aq-preview-remove"
                title="Remove {att.name}"
                aria-label="Remove {att.name}"
                on:click={() => removeAttachment(att.id)}
              >
                <X size={11} strokeWidth={2} />
              </button>
            </div>
          {/each}
        </div>
      {/if}

      <input
        bind:this={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        class="aq-hidden-file"
        on:change={(e) => handleFilesSelected((e.currentTarget as HTMLInputElement).files)}
      />

      <div class="aq-textarea-row">
        <textarea
          class="aq-textarea"
          rows="2"
          placeholder={busy || activeWorkingSource || (activeSession && activeSession.messages.length > 0)
            ? 'Reply to Quant'
            : 'Describe an indicator or attach reference...'}
          bind:value={promptText}
          disabled={busy}
          on:keydown={handleKeydown}
          on:paste={handlePaste}
        ></textarea>

        {#if !promptText.trim() && (!activeSession || activeSession.messages.length === 0) && !busy}
          <span class="aq-tab-hint" title="Press Tab to insert example prompt">Tab</span>
        {/if}
      </div>

      <div class="aq-pill-toolbar">
        <div class="aq-toolbar-left">
          <button
            type="button"
            class="aq-plus-upload-btn"
            title="Attach Reference Image (JPEG, PNG, GIF, WebP)"
            aria-label="Attach Reference Image"
            disabled={busy || attachments.length >= MAX_ATTACHMENTS_PER_PROMPT}
            on:click={() => fileInput?.click()}
          >
            <Plus size={15} strokeWidth={2} />
          </button>

          <button
            type="button"
            class="aq-mode-selector"
            title="Select Pine Script Version (Auto defaults to v6)"
            disabled={busy}
            on:click={cycleVersionMode}
          >
            <span>{selectedVersionMode === 'auto' ? 'Auto' : selectedVersionMode === 'v6' ? 'Pine v6' : 'Pine v5'}</span>
            <ChevronDown size={11} strokeWidth={2} />
          </button>
        </div>

        <div class="aq-toolbar-right">
          {#if busy}
            <button
              type="button"
              class="aq-send-btn is-stop"
              title="Stop Generation"
              aria-label="Stop Generation"
              on:click={stopGeneration}
            >
              <Square size={10} strokeWidth={2.5} fill="currentColor" />
            </button>
          {:else}
            <button
              type="button"
              class="aq-send-btn"
              title="Build & Install Indicator"
              aria-label="Send Prompt"
              disabled={!promptText.trim() && attachments.length === 0}
              on:click={() => submitPrompt()}
            >
              <ArrowUp size={15} strokeWidth={2.2} />
            </button>
          {/if}
        </div>
      </div>
    </div>
  </footer>
</aside>

<style>
  .ai-quant-panel {
    --aq-bg: #0f1014;
    --aq-surface: #16181e;
    --aq-surface-elevated: #1f222a;
    --aq-surface-hover: #252832;
    --aq-border: #232630;
    --aq-border-subtle: #1c1e26;
    --aq-text: #eef0f5;
    --aq-text-secondary: #9aa0ad;
    --aq-text-muted: #6e7381;
    --aq-user-bubble-bg: #222530;
    --aq-user-bubble-border: #2f3342;
    --aq-user-bubble-text: #f3f4f8;
    --aq-pill-bg: #15171d;
    --aq-pill-border: #282b36;
    --aq-btn-surface: #232630;
    --aq-btn-text: #d6d9e2;
    --aq-accent: #2962ff;
    --aq-code-bg: #0b0c10;
    --ph-keyword: #c678dd;
    --ph-builtin: #61afef;
    --ph-string: #98c379;
    --ph-number: #d19a66;
    --ph-color: #56b6c2;
    --ph-series: #e5c07b;
    --ph-comment: #5c6370;
    --ph-directive: #38c0fd;

    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--aq-bg);
    border-left: 1px solid var(--aq-border);
    color: var(--aq-text);
    font-size: 12.5px;
    user-select: none;
    flex-shrink: 0;
  }

  :global([data-theme="light"]) .ai-quant-panel {
    --aq-bg: #ffffff;
    --aq-surface: #f4f6f9;
    --aq-surface-elevated: #ffffff;
    --aq-surface-hover: #eaeef5;
    --aq-border: #e2e5ec;
    --aq-border-subtle: #edf0f5;
    --aq-text: #131722;
    --aq-text-secondary: #4b5262;
    --aq-text-muted: #787b86;
    --aq-user-bubble-bg: #eef2f8;
    --aq-user-bubble-border: #d9e1ee;
    --aq-user-bubble-text: #131722;
    --aq-pill-bg: #f7f8fb;
    --aq-pill-border: #dcdfe8;
    --aq-btn-surface: #e8ecf3;
    --aq-btn-text: #1e222d;
    --aq-accent: #2962ff;
    --aq-code-bg: #f8fafd;
    --ph-keyword: #7c3aed;
    --ph-builtin: #2563eb;
    --ph-string: #15803d;
    --ph-number: #c2410c;
    --ph-color: #0e7490;
    --ph-series: #b45309;
    --ph-comment: #64748b;
    --ph-directive: #0284c7;
  }

  .aq-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .resizer {
    position: absolute;
    left: -3px;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: ew-resize;
    z-index: 20;
  }

  /* Top Segmented Header Bar */
  .aq-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    height: 44px;
    padding: 6px 8px 6px 10px;
    border-bottom: 1px solid var(--aq-border);
    background: var(--aq-bg);
    flex-shrink: 0;
  }

  .aq-tab-strip {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    height: 32px;
    padding: 3px;
    border-radius: 9px;
    background: var(--aq-surface);
    border: 1px solid var(--aq-border-subtle);
    gap: 3px;
  }

  .aq-tab-pill {
    flex: 1;
    min-width: 0;
    height: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 9px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--aq-text-secondary);
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.14s, color 0.14s, box-shadow 0.14s;
  }

  .aq-tab-pill.active {
    background: var(--aq-surface-elevated);
    color: var(--aq-text);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14);
  }

  .aq-tab-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .aq-header-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .aq-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--aq-text-secondary);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .aq-icon-btn:hover:not(:disabled),
  .aq-icon-btn.active {
    background: var(--aq-surface-hover);
    color: var(--aq-text);
  }

  .aq-icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Warning Banner */
  .aq-config-warning {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 12px;
    background: rgba(255, 152, 0, 0.1);
    border-bottom: 1px solid rgba(255, 152, 0, 0.25);
    color: #d97706;
    font-size: 11px;
    line-height: 1.35;
    flex-shrink: 0;
  }

  :global([data-theme="dark"]) .aq-config-warning {
    color: #ffb74d;
  }

  /* Drawers (History & Code Inspection) */
  .aq-drawer {
    display: flex;
    flex-direction: column;
    max-height: 230px;
    border-bottom: 1px solid var(--aq-border);
    background: var(--aq-surface);
    flex-shrink: 0;
  }

  .aq-drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 12px;
    border-bottom: 1px solid var(--aq-border-subtle);
    font-size: 11px;
    font-weight: 600;
    color: var(--aq-text-secondary);
  }

  .aq-drawer-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .aq-open-editor-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 7px;
    border-radius: 5px;
    border: 1px solid var(--aq-border);
    background: var(--aq-surface-elevated);
    color: var(--aq-accent);
    font-size: 10.5px;
    font-weight: 500;
    cursor: pointer;
  }

  .aq-drawer-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    color: var(--aq-text-secondary);
    cursor: pointer;
  }

  .aq-version-list {
    overflow-y: auto;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .aq-version-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 9px;
    border-radius: 7px;
    background: var(--aq-surface-elevated);
    border: 1px solid var(--aq-border);
  }

  .aq-version-row.current {
    border-color: rgba(41, 98, 255, 0.5);
  }

  .aq-version-meta {
    min-width: 0;
    flex: 1;
  }

  .aq-version-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--aq-text);
  }

  .aq-active-tag {
    font-size: 9.5px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(14, 203, 129, 0.16);
    color: #089981;
  }

  .aq-version-summary {
    margin: 2px 0 0;
    font-size: 10.5px;
    color: var(--aq-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .aq-restore-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 5px;
    border: 1px solid var(--aq-border);
    background: var(--aq-surface);
    color: var(--aq-text);
    font-size: 10.5px;
    font-weight: 500;
    cursor: pointer;
    flex-shrink: 0;
  }

  .aq-restore-btn:hover:not(:disabled) {
    border-color: var(--aq-accent);
    color: var(--aq-accent);
  }

  /* Syntax Highlighted Code Container */
  .aq-code-highlight-box {
    margin: 0;
    padding: 8px 10px;
    overflow: auto;
    background: var(--aq-code-bg);
    font-family: "Roboto Mono", ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 10.5px;
    line-height: 1.5;
    color: var(--aq-text);
    user-select: text;
  }

  .aq-code-line {
    display: flex;
    align-items: baseline;
    gap: 10px;
    white-space: pre;
  }

  .aq-line-num {
    min-width: 22px;
    text-align: right;
    color: var(--aq-text-muted);
    font-size: 9.5px;
    user-select: none;
    opacity: 0.7;
  }

  .aq-line-code {
    flex: 1;
  }

  :global(.ph-keyword) {
    color: var(--ph-keyword);
    font-weight: 500;
  }
  :global(.ph-builtin) {
    color: var(--ph-builtin);
  }
  :global(.ph-string) {
    color: var(--ph-string);
  }
  :global(.ph-number) {
    color: var(--ph-number);
  }
  :global(.ph-color) {
    color: var(--ph-color);
    font-weight: 500;
  }
  :global(.ph-series) {
    color: var(--ph-series);
  }
  :global(.ph-comment) {
    color: var(--ph-comment);
    font-style: italic;
  }
  :global(.ph-directive) {
    color: var(--ph-directive);
    font-weight: 600;
  }

  /* All Chats View */
  .aq-all-chats {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .aq-all-chats-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 600;
    color: var(--aq-text-secondary);
  }

  .aq-new-session-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 9px;
    border-radius: 6px;
    border: 1px solid var(--aq-border);
    background: var(--aq-surface);
    color: var(--aq-text);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .aq-session-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .aq-session-card {
    padding: 10px 11px;
    border-radius: 9px;
    border: 1px solid var(--aq-border);
    background: var(--aq-surface);
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s;
  }

  .aq-session-card:hover,
  .aq-session-card.selected {
    background: var(--aq-surface-hover);
    border-color: rgba(41, 98, 255, 0.45);
  }

  .aq-session-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    font-size: 12px;
    color: var(--aq-text);
  }

  .aq-version-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(41, 98, 255, 0.14);
    color: var(--aq-accent);
    font-weight: 600;
  }

  .aq-session-card-sub {
    margin: 4px 0 0;
    font-size: 11px;
    color: var(--aq-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Main Conversation Feed */
  .aq-conversation {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Hero Empty State */
  .aq-empty-hero {
    position: relative;
    margin: auto 0;
    padding: 20px 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 12px;
  }

  .aq-hero-glow {
    position: absolute;
    width: 190px;
    height: 190px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.065) 0%, transparent 70%);
    pointer-events: none;
    top: -12px;
  }

  :global([data-theme="light"]) .aq-hero-glow {
    background: radial-gradient(circle, rgba(41, 98, 255, 0.075) 0%, transparent 70%);
  }

  .aq-hero-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 11px;
    margin-bottom: 2px;
  }

  .aq-hero-logo {
    width: 38px;
    height: 38px;
    object-fit: contain;
    border-radius: 8px;
  }

  .aq-hero-title {
    margin: 0;
    font-size: 21px;
    font-weight: 650;
    line-height: 1.22;
    letter-spacing: -0.02em;
    color: var(--aq-text);
  }

  .aq-hero-subtitle {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--aq-text-secondary);
    max-width: 260px;
  }

  .aq-status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #089981;
    flex-shrink: 0;
  }

  .aq-starter-cards {
    display: flex;
    flex-direction: column;
    gap: 7px;
    width: 100%;
    margin-top: 10px;
  }

  .aq-starter-card {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--aq-border);
    background: var(--aq-surface);
    color: var(--aq-text);
    font-size: 11.5px;
    line-height: 1.4;
    text-align: left;
    cursor: pointer;
    transition: background 0.14s, border-color 0.14s;
  }

  .aq-starter-card:hover:not(:disabled) {
    background: var(--aq-surface-hover);
    border-color: var(--aq-pill-border);
  }

  /* Conversation Messages */
  .aq-msg {
    display: flex;
    flex-direction: column;
  }

  .aq-msg-user {
    align-items: flex-end;
  }

  .aq-user-bubble {
    max-width: 88%;
    padding: 10px 13px;
    border-radius: 14px 14px 4px 14px;
    background: var(--aq-user-bubble-bg);
    border: 1px solid var(--aq-user-bubble-border);
    color: var(--aq-user-bubble-text);
    line-height: 1.45;
    user-select: text;
  }

  .aq-msg-assistant {
    align-items: stretch;
  }

  .aq-assistant-flow {
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: var(--aq-text);
    line-height: 1.55;
    user-select: text;
  }

  .aq-msg.is-error .aq-assistant-flow {
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(242, 54, 69, 0.1);
    border: 1px solid rgba(242, 54, 69, 0.3);
    color: #e11d48;
  }

  :global([data-theme="dark"]) .aq-msg.is-error .aq-assistant-flow {
    color: #ff8a93;
  }

  .aq-msg-text {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 12.5px;
    font-weight: 450;
  }

  .aq-msg-attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 7px;
  }

  .aq-img-chip {
    font-size: 10.5px;
    padding: 2px 7px;
    border-radius: 5px;
    background: var(--aq-surface-elevated);
    border: 1px solid var(--aq-border);
    color: var(--aq-text-secondary);
  }

  .aq-telemetry-note {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--aq-text-muted);
  }

  .aq-action-bar {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .aq-tool-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--aq-text-secondary);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .aq-tool-icon:hover:not(:disabled),
  .aq-tool-icon.active {
    background: var(--aq-surface-hover);
    color: var(--aq-text);
  }

  .aq-followup-block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 9px;
    margin-top: 4px;
  }

  .aq-new-chat-inline {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    padding: 2px 0;
    background: transparent;
    color: var(--aq-text-secondary);
    font-size: 11.5px;
    cursor: pointer;
  }

  .aq-new-chat-inline:hover {
    color: var(--aq-text);
  }

  .aq-followup-cards {
    display: flex;
    flex-direction: column;
    gap: 7px;
    width: 100%;
  }

  .aq-followup-card {
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--aq-border);
    background: var(--aq-surface);
    color: var(--aq-text);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.38;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
  }

  .aq-followup-card:hover {
    background: var(--aq-surface-hover);
    border-color: var(--aq-pill-border);
  }

  /* LuxAlgo-Style Live Thinking & Code Building Animation Card */
  .aq-live-status.aq-lux-card {
    padding: 0;
    border-radius: 13px;
    background: var(--aq-surface);
    border: 1px solid var(--aq-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  }

  :global([data-theme="light"]) .aq-live-status.aq-lux-card {
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.06);
  }

  .aq-lux-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 12px;
    border-bottom: 1px solid var(--aq-border-subtle);
    background: var(--aq-surface);
  }

  .aq-lux-breadcrumb {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    font-size: 11.5px;
  }

  :global(.aq-lux-bc-icon) {
    color: var(--aq-text-muted);
    flex-shrink: 0;
  }

  .aq-lux-bc-root {
    color: var(--aq-text-secondary);
    font-weight: 500;
    flex-shrink: 0;
  }

  :global(.aq-lux-bc-sep) {
    color: var(--aq-text-muted);
    flex-shrink: 0;
    opacity: 0.7;
  }

  .aq-lux-bc-current {
    color: var(--aq-text);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .aq-lux-line-count {
    font-size: 11px;
    color: var(--aq-text-secondary);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .aq-lux-card-body {
    position: relative;
    background: var(--aq-code-bg);
    min-height: 158px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .aq-lux-plan-stage {
    position: relative;
    flex: 1;
    min-height: 158px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
  }

  .aq-lux-cursor-row {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding-left: 36px;
    padding-top: 2px;
  }

  .aq-lux-dash {
    color: var(--aq-text-muted);
    font-family: "Roboto Mono", ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 13px;
    font-weight: 600;
  }

  .aq-lux-caret {
    display: inline-block;
    width: 2px;
    height: 15px;
    border-radius: 1px;
    background: #38bdf8;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.75);
    animation: aq-caret-blink 1s steps(2, start) infinite;
  }

  @keyframes aq-caret-blink {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.15;
    }
  }

  .aq-lux-ghost-context {
    margin-top: auto;
    padding-top: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    filter: blur(0.65px);
    opacity: 0.36;
    user-select: none;
    pointer-events: none;
  }

  .aq-lux-ghost-prompt {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--aq-text);
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .aq-lux-ghost-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: "Roboto Mono", ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 11px;
    font-weight: 600;
    color: var(--aq-text-secondary);
  }

  .aq-lux-code-box {
    padding: 10px 12px;
    min-height: 158px;
    max-height: 176px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 2px;
  }

  .aq-lux-code-box .aq-code-line {
    gap: 7px;
    opacity: 0.62;
    filter: blur(0.35px);
    transition: opacity 0.15s, filter 0.15s;
  }

  .aq-lux-code-box .aq-code-line.is-latest {
    opacity: 1;
    filter: none;
  }

  .aq-lux-code-box .aq-code-line.is-latest .aq-line-num {
    color: var(--aq-text);
    font-weight: 700;
    opacity: 1;
  }

  .aq-line-pipe {
    color: #10b981;
    font-weight: 600;
    opacity: 0.7;
    user-select: none;
  }

  .aq-lux-code-box .aq-code-line.is-latest .aq-line-pipe {
    color: #34d399;
    opacity: 1;
    text-shadow: 0 0 6px rgba(52, 211, 153, 0.5);
  }

  .aq-lux-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--aq-border-subtle);
    background: var(--aq-surface);
    font-size: 11.5px;
  }

  .aq-lux-footer-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .aq-lux-orb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 30%, #e0f2fe 0%, #38bdf8 42%, #0284c7 78%, #1e3a8a 100%);
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.65);
    animation: aq-orb-pulse 1.8s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes aq-orb-pulse {
    0%, 100% {
      transform: scale(0.94);
      box-shadow: 0 0 6px rgba(56, 189, 248, 0.45);
    }
    50% {
      transform: scale(1.08);
      box-shadow: 0 0 13px rgba(56, 189, 248, 0.85);
    }
  }

  .aq-lux-status-shimmer {
    font-weight: 500;
    background: linear-gradient(90deg, var(--aq-text) 0%, #38bdf8 50%, var(--aq-text-secondary) 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: aq-text-shimmer 2.4s linear infinite;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @keyframes aq-text-shimmer {
    0% {
      background-position: 0% center;
    }
    100% {
      background-position: 200% center;
    }
  }

  .aq-lux-footer-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    color: var(--aq-text-secondary);
    font-size: 11px;
  }

  .aq-lux-pine-badge {
    font-weight: 500;
    color: var(--aq-text-secondary);
  }

  .aq-lux-elapsed {
    font-variant-numeric: tabular-nums;
    color: var(--aq-text-secondary);
  }

  .aq-busy-new-chat-row {
    margin-top: auto;
    padding-top: 8px;
    display: flex;
    align-items: center;
  }

  .aq-repair-timeline {
    padding: 6px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .aq-repair-card {
    padding: 7px 9px;
    border-radius: 8px;
    background: rgba(255, 152, 0, 0.08);
    border: 1px solid rgba(255, 152, 0, 0.25);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .aq-repair-card-head {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10.5px;
    color: #d97706;
  }

  :global([data-theme="dark"]) .aq-repair-card-head {
    color: #ffb74d;
  }

  .aq-repair-card-detail {
    margin: 0;
    font-size: 10.5px;
    color: var(--aq-text-secondary);
    line-height: 1.35;
  }

  .aq-stream-snippet {
    margin: 0;
    overflow: hidden;
  }

  /* Bottom Pill Composer */
  .aq-composer {
    padding: 8px 12px 12px;
    background: var(--aq-bg);
    display: flex;
    flex-direction: column;
    gap: 7px;
    flex-shrink: 0;
  }

  .aq-attachment-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 8px;
    background: rgba(242, 54, 69, 0.12);
    border: 1px solid rgba(242, 54, 69, 0.3);
    color: #e11d48;
    font-size: 11px;
  }

  :global([data-theme="dark"]) .aq-attachment-error {
    color: #ff8a93;
  }

  .aq-attachment-error button {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    display: inline-flex;
  }

  .aq-pill-box {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 11px 12px 10px 14px;
    border-radius: 16px;
    border: 1px solid var(--aq-pill-border);
    background: var(--aq-pill-bg);
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .aq-pill-box:focus-within {
    border-color: var(--aq-text-muted);
  }

  .aq-continuation-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--aq-border-subtle);
    font-size: 11px;
    color: var(--aq-text-secondary);
  }

  .aq-continuation-label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .aq-continuation-label strong {
    color: var(--aq-text);
    font-weight: 600;
  }

  :global(.aq-cont-icon) {
    color: #089981;
    flex-shrink: 0;
  }

  .aq-cont-new-btn {
    border: 1px solid var(--aq-border);
    border-radius: 5px;
    padding: 1px 6px;
    background: var(--aq-surface);
    color: var(--aq-text-secondary);
    font-size: 10px;
    font-weight: 500;
    cursor: pointer;
    flex-shrink: 0;
  }

  .aq-cont-new-btn:hover:not(:disabled) {
    color: var(--aq-text);
    border-color: var(--aq-text-muted);
  }

  .aq-preview-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .aq-preview-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 7px 3px 3px;
    border-radius: 7px;
    background: var(--aq-surface-elevated);
    border: 1px solid var(--aq-border);
    max-width: 155px;
    flex-shrink: 0;
  }

  .aq-preview-thumb {
    width: 24px;
    height: 24px;
    object-fit: cover;
    border-radius: 5px;
  }

  .aq-preview-name {
    font-size: 10.5px;
    color: var(--aq-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .aq-preview-remove {
    border: 0;
    padding: 2px;
    background: transparent;
    color: var(--aq-text-secondary);
    cursor: pointer;
    display: inline-flex;
  }

  .aq-preview-remove:hover {
    color: #f23645;
  }

  .aq-hidden-file {
    display: none;
  }

  .aq-textarea-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .aq-textarea {
    flex: 1;
    min-width: 0;
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--aq-text);
    font-family: inherit;
    font-size: 13px;
    line-height: 1.45;
    resize: none;
    outline: none;
    max-height: 120px;
  }

  .aq-textarea::placeholder {
    color: var(--aq-text-muted);
  }

  .aq-tab-hint {
    font-size: 10px;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: 5px;
    border: 1px solid var(--aq-border);
    color: var(--aq-text-muted);
    flex-shrink: 0;
    margin-top: 1px;
  }

  .aq-pill-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .aq-toolbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .aq-plus-upload-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 9px;
    background: var(--aq-btn-surface);
    color: var(--aq-btn-text);
    cursor: pointer;
    transition: background 0.12s, opacity 0.12s;
  }

  .aq-plus-upload-btn:hover:not(:disabled) {
    background: var(--aq-surface-hover);
  }

  .aq-plus-upload-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .aq-mode-selector {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 28px;
    padding: 0 7px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--aq-text-secondary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .aq-mode-selector:hover:not(:disabled) {
    background: var(--aq-surface-hover);
    color: var(--aq-text);
  }

  .aq-toolbar-right {
    display: flex;
    align-items: center;
  }

  .aq-send-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 10px;
    background: var(--aq-btn-surface);
    color: var(--aq-btn-text);
    cursor: pointer;
    transition: background 0.14s, color 0.14s, opacity 0.14s;
  }

  .aq-send-btn:not(:disabled):hover {
    background: var(--aq-accent);
    color: #ffffff;
  }

  .aq-send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .aq-send-btn.is-stop {
    background: #f3f4f8;
    color: #0f1014;
  }

  :global([data-theme="light"]) .aq-send-btn.is-stop {
    background: #131722;
    color: #ffffff;
  }
</style>
