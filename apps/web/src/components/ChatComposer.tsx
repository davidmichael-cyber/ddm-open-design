'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import { useI18n, useT } from '../i18n';
import type { Dict, Locale } from '../i18n/types';
import {
  localizeSkillDescription,
  localizeSkillName,
} from '../i18n/content';
import { useAnalytics } from '../analytics/provider';
import {
  trackChatPanelClick,
  trackFileUploadResult,
} from '../analytics/events';
import { deriveUploadCohort } from '../analytics/upload-tracking';
import { IMAGE_MODELS } from "../media/models";
import { projectRawUrl, uploadProjectFiles, openFolderDialog, fetchConnectors } from "../providers/registry";
import { patchProject } from "../state/projects";
import { fetchMcpServers } from "../state/mcp";
import type { McpServerConfig, McpTemplate } from "../state/mcp";
import { listPlugins } from "../state/projects";
import type { AppConfig, ChatAttachment, ChatCommentAttachment, Project, ProjectFile, ProjectMetadata, SkillSummary } from "../types";
import type {
  ContextItem,
  AppliedPluginSnapshot,
  ChatSessionMode,
  ConnectorDetail,
  InstalledPluginRecord,
  PluginSourceKind,
  ResearchOptions,
  RunContextSelection,
  WorkspaceContextItem,
} from '@open-design/contracts';
import { buildVisualAnnotationAttachment, commentTargetDisplayName } from '../comments';
import { Icon, type IconName } from "./Icon";
import { SessionModeToggle } from './SessionModeToggle';
import { PluginDetailsModal } from "./PluginDetailsModal";
import { PluginsSection, type PluginsSectionHandle } from "./PluginsSection";
import { BUILT_IN_PETS, CUSTOM_PET_ID } from "./pet/pets";
import {
  inlineMentionToken,
  type InlineMentionEntity,
} from '../utils/inlineMentions';
import {
  LexicalComposerInput,
  type LexicalComposerInputHandle,
  type CaretRect,
} from './composer/LexicalComposerInput';
import { CaretFloatingLayer } from './composer/CaretFloatingLayer';
import { ANNOTATION_EVENT, type AnnotationEventDetail } from "./PreviewDrawOverlay";
import { DesignSystemSwitchPicker } from "./DesignSystemSwitchPicker";

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

type ToolsTab = 'plugins' | 'skills' | 'mcp' | 'import';

type MentionTab = 'all' | 'tabs' | 'files' | 'plugins' | 'skills' | 'mcp' | 'connectors';

const USER_PLUGIN_SOURCE_KINDS = new Set<PluginSourceKind>([
  'user',
  'project',
  'marketplace',
  'github',
  'url',
  'local',
]);

interface SlashCommand {
  id: string;
  // Visible label, e.g. `/hatch`. Shown in the popover row.
  label: string;
  // Text inserted into the draft when the user picks the entry. The
  // cursor is positioned at the end of `insert`, so a trailing space
  // is the difference between a "ready for argument" command and a
  // "submit immediately" one.
  insert: string;
  // i18n key of the short description shown next to the label.
  descKey: keyof Dict;
  // Optional argument hint shown after the description.
  argHint?: string;
  // Icon glyph from the project Icon set.
  icon: 'sparkles' | 'eye' | 'sliders';
}

type DesignToolboxActionId =
  | 'auto-match'
  | 'motion'
  | 'motion-polish'
  | 'anti-ai-polish'
  | 'visual-polish'
  | 'image-gen'
  | 'video-gen';

type DesignToolboxResourceKind =
  | 'skill'
  | 'plugin'
  | 'mcp'
  | 'mcp-template'
  | 'connector'
  | 'file';

interface DesignToolboxAction {
  id: DesignToolboxActionId;
  title: string;
  badge: string;
  description: string;
  icon: IconName;
  preferredSkillIds: string[];
  categoryHints: string[];
  searchTerms: string[];
}

interface DesignToolboxResourceIndex {
  skills: SkillSummary[];
  plugins: InstalledPluginRecord[];
  mcpServers: McpServerConfig[];
  mcpTemplates: McpTemplate[];
  connectors: ConnectorDetail[];
  projectFiles: ProjectFile[];
}

type DesignToolboxResourceBase = {
  key: string;
  kind: DesignToolboxResourceKind;
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  icon: IconName;
  searchText: string;
};

type DesignToolboxResource =
  | (DesignToolboxResourceBase & { kind: 'skill'; skill: SkillSummary })
  | (DesignToolboxResourceBase & { kind: 'plugin'; plugin: InstalledPluginRecord })
  | (DesignToolboxResourceBase & { kind: 'mcp'; server: McpServerConfig })
  | (DesignToolboxResourceBase & { kind: 'mcp-template'; template: McpTemplate })
  | (DesignToolboxResourceBase & { kind: 'connector'; connector: ConnectorDetail })
  | (DesignToolboxResourceBase & { kind: 'file'; file: ProjectFile });

const DESIGN_TOOLBOX_ACTIONS: DesignToolboxAction[] = [
  {
    id: 'auto-match',
    title: '智能匹配下一步',
    badge: '匹配',
    description: '先定义好看标准，再全局匹配 skills / MCP / plugins / connectors / files。',
    icon: 'sparkles',
    preferredSkillIds: ['creative-director', 'frontend-design', 'design-taste-frontend'],
    categoryHints: ['creative-direction', 'web-artifacts'],
    searchTerms: ['match', 'recommend', 'next step', 'workflow', 'skills', 'mcp', 'plugins', 'connector', 'files', '匹配', '下一步', '推荐', '流程', '审美'],
  },
  {
    id: 'motion',
    title: '加动画 / 动效',
    badge: '动画',
    description: '给当前 HTML 或页面元素加入场、滚动、状态切换和微交互。',
    icon: 'play',
    preferredSkillIds: ['emilkowalski-motion', 'gsap-react', 'gsap-scrolltrigger', 'gsap-timeline', 'gsap-core'],
    categoryHints: ['animation-motion'],
    searchTerms: ['animation', 'motion', 'gsap', 'micro interaction', 'scrolltrigger', '动效', '动画', '微交互'],
  },
  {
    id: 'motion-polish',
    title: '动效润色',
    badge: '节奏',
    description: '检查现有动效的节奏、缓动、性能和 reduced-motion 兜底。',
    icon: 'sliders',
    preferredSkillIds: ['gsap-performance', 'emilkowalski-motion', 'gsap-timeline', 'gsap-core'],
    categoryHints: ['animation-motion'],
    searchTerms: ['motion polish', 'easing', 'performance', 'reduced motion', 'timeline', '动效润色', '缓动', '性能'],
  },
  {
    id: 'anti-ai-polish',
    title: '反 AI 味美化',
    badge: '去味',
    description: '移除模板感、AI 紫蓝渐变、廉价卡片堆叠和空泛 copy。',
    icon: 'paint-bucket',
    preferredSkillIds: ['design-taste-frontend', 'gpt-taste', 'frontend-design', 'impeccable-design-polish'],
    categoryHints: ['creative-direction', 'web-artifacts'],
    searchTerms: ['anti ai', 'anti slop', 'taste', 'generic', 'beautify', '反 ai', '去 ai 味', '美化', '润色'],
  },
  {
    id: 'visual-polish',
    title: '设计润色 / 可交付',
    badge: '润色',
    description: '审一次视觉层级、排版、间距、响应式、可访问性和交付状态。',
    icon: 'palette',
    preferredSkillIds: ['impeccable-design-polish', 'frontend-design', 'creative-director', 'design-taste-frontend'],
    categoryHints: ['creative-direction', 'web-artifacts'],
    searchTerms: ['polish', 'critique', 'audit', 'harden', 'responsive', 'accessibility', '润色', '审稿', '交付'],
  },
  {
    id: 'image-gen',
    title: '生图 / 视觉参考',
    badge: '生图',
    description: '为当前页面生成分区视觉参考、素材、图标、社媒图或 moodboard。',
    icon: 'image',
    preferredSkillIds: ['imagegen-frontend-web', 'fal-generate', 'imagen', 'venice-image-generate', 'image-enhancer'],
    categoryHints: ['image-generation'],
    searchTerms: ['image', 'generate image', 'visual reference', 'moodboard', 'section image', '生图', '配图', '视觉参考'],
  },
  {
    id: 'video-gen',
    title: '生视频 / 动画脚本',
    badge: '视频',
    description: '把设计转成短视频、Remotion / Hyperframes 分镜或可生成视频的 prompt。',
    icon: 'play',
    preferredSkillIds: ['video-hyperframes', 'sora', 'fal-video-edit', 'venice-video', 'replicate'],
    categoryHints: ['video-generation'],
    searchTerms: ['video', 'sora', 'remotion', 'hyperframes', 'storyboard', '生视频', '视频', '分镜'],
  },
];

interface Props {
  projectId: string | null;
  projectFiles: ProjectFile[];
  streaming: boolean;
  sessionMode?: ChatSessionMode;
  onSessionModeChange?: (mode: ChatSessionMode) => void;
  sendDisabled?: boolean;
  initialDraft?: string;
  draftStorageKey?: string;
  // Lazy ensure — the composer calls this before its first upload, so the
  // project folder exists on disk before files land in it. Returns the
  // project id when ready.
  onEnsureProject: () => Promise<string | null>;
  commentAttachments?: ChatCommentAttachment[];
  onRemoveCommentAttachment?: (id: string) => void;
  // Available skills the user can compose into a turn via @<skill>. The
  // chat layer already filters out disabled skills before passing them in
  // here, so the picker can render the list as-is. Keep this optional so
  // the composer still works on surfaces that don't show a skills picker
  // (e.g. tests, screenshot harnesses).
  skills?: SkillSummary[];
  onSend: (
    prompt: string,
    attachments: ChatAttachment[],
    commentAttachments: ChatCommentAttachment[],
    meta?: ChatSendMeta,
  ) => void;
  onStop: () => void;
  // Opens the global settings dialog (CLI / model / agent picker). The
  // composer's leading gear icon routes here so users can switch models
  // without leaving the chat.
  onOpenSettings?: () => void;
  // Opens settings on the External MCP tab. Wired from ChatPane → App.
  // The composer's `/mcp` slash command and the MCP picker button route here.
  onOpenMcpSettings?: () => void;
  // Optional pet wiring. The composer no longer renders a visible pet
  // entry, but existing manual `/pet` commands still route here.
  petConfig?: AppConfig['pet'];
  onAdoptPet?: (petId: string) => void;
  onTogglePet?: () => void;
  onOpenPetSettings?: () => void;
  researchAvailable?: boolean;
  projectMetadata?: ProjectMetadata;
  onProjectMetadataChange?: (metadata: ProjectMetadata) => void;
  activeWorkspaceContext?: WorkspaceContextItem | null;
  workspaceContexts?: WorkspaceContextItem[];
  // SenseAudio BYOK image-model picker shown above the textarea. Hidden
  // when the active chat protocol is anything other than 'senseaudio',
  // so the composer stays clean for every other BYOK tab. The state
  // owner is ProjectView (per-session, reset on refresh); ChatComposer
  // is a fully controlled select.
  byokApiProtocol?: AppConfig['apiProtocol'];
  byokImageModel?: string;
  onChangeByokImageModel?: (model: string) => void;
  currentSkillId?: string | null;
  onProjectSkillChange?: (skillId: string | null) => void;
  // Set when the project was created with a plugin already pinned
  // (PluginLoopHome on Home). When provided, the in-composer plugin
  // rail collapses to the single pinned plugin so the user can see
  // which plugin is active without being offered every other installed
  // plugin (the user reported "选了 new-generation, 结果 composer 显
  // 示了多个 plugin"). The active plugin still appears as an
  // ActivePluginChip on each user message (see UserMessage in
  // ChatPane). Pass `null` (or omit) to render the full rail.
  pinnedPluginId?: string | null;
  footerAccessory?: ReactNode;
  // Project's current `designSystemId`. The mid-chat design-system picker
  // uses this to surface a "current" indicator and to no-op a redundant
  // switch. Optional so test/screenshot harnesses can omit it.
  currentDesignSystemId?: string | null;
  // Fires after a successful `PATCH /api/projects/:id` from the mid-chat
  // design-system picker. Receives the full patched `Project` straight
  // from the PATCH response so the parent replaces its mirror wholesale —
  // rebuilding from a stale `project` prop would drop server-owned fields
  // the daemon refreshes on every PATCH (e.g. `updatedAt`).
  onActiveDesignSystemChange?: (project: Project) => void;
  // Optional transient banner sink. The composer emits one short message
  // here when a mid-chat design-system switch lands (or fails) so the user
  // has explicit confirmation without re-opening the picker.
  onShowToast?: (message: string) => void;
}

// Imperative handle so ancestors (e.g. example chips in ChatPane) can
// push text into the composer without owning its draft state.
export interface ChatComposerHandle {
  setDraft: (text: string) => void;
  restoreDraft: (draft: {
    text: string;
    attachments?: ChatAttachment[];
    commentAttachments?: ChatCommentAttachment[];
    /**
     * The queued turn's meta. When present, restoreDraft rebuilds the staged
     * plugin / connector / skill / MCP context (and re-shows their chips) so
     * editing a queued item keeps its bindings instead of silently dropping
     * them.
     */
    meta?: ChatSendMeta;
  }) => void;
  focus: () => void;
}

export interface ChatSendMeta {
  queueOnly?: boolean;
  research?: ResearchOptions;
  context?: RunContextSelection;
  appliedPluginSnapshot?: AppliedPluginSnapshot;
  appliedPluginSnapshotId?: string;
  // Per-turn skill ids picked via the @-mention popover. The chat layer
  // forwards these to the daemon's `skillIds` field so the system prompt
  // for this run only is composed with the extra skill bodies, without
  // touching the project's persistent `skillId`.
  skillIds?: string[];
}

/**
 * The chat composer: textarea + paste/drop/attach buttons + @-mention
 * picker. Attachments are uploaded into the active project's folder so
 * the agent can reference them by relative path on its next turn.
 *
 * `@` typed at a word boundary opens a popover listing project files.
 * Selecting one inserts `@<path>` into the prompt and stages it as an
 * attachment so the daemon also includes it explicitly.
 */
export const ChatComposer = forwardRef<ChatComposerHandle, Props>(
  function ChatComposer(
    {
      projectId,
      projectFiles,
      streaming,
      sessionMode = 'design',
      onSessionModeChange,
      sendDisabled = false,
      initialDraft,
      draftStorageKey,
      onEnsureProject,
      commentAttachments = [],
      onRemoveCommentAttachment,
      skills = [],
      onSend,
      onStop,
      onOpenMcpSettings,
      petConfig,
      onAdoptPet,
      onTogglePet,
      onOpenPetSettings,
      researchAvailable = false,
      projectMetadata,
      onProjectMetadataChange,
      activeWorkspaceContext = null,
      workspaceContexts = [],
      byokApiProtocol,
      byokImageModel,
      onChangeByokImageModel,
      currentSkillId = null,
      onProjectSkillChange,
      pinnedPluginId = null,
      footerAccessory,
      currentDesignSystemId = null,
      onActiveDesignSystemChange,
      onShowToast,
    },
    ref
  ) {
    const t = useT();
    const analytics = useAnalytics();
    const [draft, setDraft] = useState(() => initialDraft ?? loadComposerDraft(draftStorageKey) ?? "");
    // Synchronous mirror of `draft`. Event handlers that mutate the draft off
    // a captured render closure (notably the annotation listener, where two
    // uploads can resolve concurrently) read/write this ref so their edits
    // compose instead of clobbering one another. Kept in lockstep with `draft`
    // by handleEditorChange (the editor is the single source for typing) and by
    // the programmatic-set paths below.
    const draftRef = useRef(draft);

    // chat_panel page_view fires from ProjectView (which outlives
    // conversation switches) so the event measures real chat-panel
    // entries rather than ChatComposer remounts. See PR #2285 review
    // 2026-05-20 04:08 for the rationale.
    const [staged, setStaged] = useState<ChatAttachment[]>([]);
    const nextAttachmentOrderRef = useRef(0);
    const [stagedVisualComments, setStagedVisualComments] = useState<ChatCommentAttachment[]>([]);
    const streamingAnnotationSendPendingRef = useRef(false);
    const [streamingAnnotationSendPending, setStreamingAnnotationSendPendingState] = useState(false);
    // Skills the user has @-mentioned for this turn. We dedupe on id and
    // strip the chip when the user removes the corresponding `@<skill>`
    // token from the draft, keeping draft and chips in sync.
    const [stagedSkills, setStagedSkills] = useState<SkillSummary[]>([]);
    const [stagedMcpServers, setStagedMcpServers] = useState<McpServerConfig[]>([]);
    const [stagedConnectors, setStagedConnectors] = useState<ConnectorDetail[]>([]);
    const [stagedWorkspaceContexts, setStagedWorkspaceContexts] = useState<WorkspaceContextItem[]>([]);
    const [dismissedWorkspaceContextId, setDismissedWorkspaceContextId] = useState<string | null>(null);
    const activeWorkspaceContextId = activeWorkspaceContext?.id ?? null;
    const previousWorkspaceContextIdRef = useRef<string | null>(activeWorkspaceContextId);
    const [dragActive, setDragActive] = useState(false);
    // Lexical owns the caret, so the mention/slash trigger state only carries
    // the typed query — no cursor offset.
    const [mention, setMention] = useState<{ q: string } | null>(null);
    // Active-row index for the @-popover's visible union (files → plugins →
    // skills → mcp → connectors). Resets to 0 whenever the query identity or
    // tab changes; drives the visual highlight + Enter/Tab target.
    const [mentionIndex, setMentionIndex] = useState(0);
    const [mentionTab, setMentionTab] = useState<MentionTab>('all');
    // Viewport caret box the floating popover anchors against. Sampled by the
    // editor at trigger-detection time; null when no trigger is live.
    const [caretRect, setCaretRect] = useState<CaretRect | null>(null);
    // Slash-command popover state — when the draft starts with `/` and the
    // cursor is still inside that token (no space committed yet), we show a
    // small palette of supported commands. The query is the text after `/`
    // so the user can type-to-filter.
    const [slash, setSlash] = useState<{ q: string } | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    // External MCP servers configured by the user. Fetched lazily on mount;
    // shown in the slash-command palette so `/mcp <id>` inserts a hint into
    // the prompt that nudges the model to use that server's tools.
    const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
    const [mcpTemplates, setMcpTemplates] = useState<McpTemplate[]>([]);
    const [connectors, setConnectors] = useState<ConnectorDetail[]>([]);
    // Installed plugins, fetched lazily for the tools-menu Plugins tab and
    // the @-mention picker. Both surfaces share the same list so applying
    // a plugin from either path lands on the same project context.
    const [installedPlugins, setInstalledPlugins] = useState<InstalledPluginRecord[]>([]);
    // Detail modal — opened from a context chip click (kind === 'plugin')
    // or from the tools-menu "Details" affordance.
    const [detailsRecord, setDetailsRecord] = useState<InstalledPluginRecord | null>(null);
    const [activeAppliedPlugin, setActiveAppliedPlugin] =
      useState<AppliedPluginSnapshot | null>(null);
    const pluginsSectionRef = useRef<PluginsSectionHandle | null>(null);
    // Consolidated "tools" popover — a single dropdown anchored to the
    // leading sliders icon that hosts project context, MCP, Import actions,
    // and a shortcut to open the full Settings dialog. Replaces the previous
    // row of three standalone buttons (which overflowed in narrow chats).
    const [toolsOpen, setToolsOpen] = useState(false);
    const [toolsTab, setToolsTab] = useState<ToolsTab>('plugins');
    const [designToolboxOpen, setDesignToolboxOpen] = useState(false);
    // Defer the (large) plugin / MCP / connector fetches until the composer is
    // actually used — first focus, the tools popover opening, an @/slash
    // trigger, or a pre-seeded draft. An untouched empty composer (e.g. a home
    // surface the user bounces off, or a background chat) never pays for the
    // full plugin-manifest list. Latches once true and never resets.
    const [composerEngaged, setComposerEngaged] = useState(
      () => (draft ?? '').trim().length > 0,
    );
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    // The Lexical editor handle — drives text/mention/clear/focus from the
    // host. Replaces the old textareaRef + manual selection plumbing. IME
    // composition guarding now lives inside the editor's command handlers.
    const editorRef = useRef<LexicalComposerInputHandle | null>(null);
    const toolsMenuRef = useRef<HTMLDivElement | null>(null);
    const toolsTriggerRef = useRef<HTMLButtonElement | null>(null);
    const designToolboxMenuRef = useRef<HTMLDivElement | null>(null);
    const designToolboxTriggerRef = useRef<HTMLButtonElement | null>(null);
    const petEnabled = Boolean(onAdoptPet && onTogglePet);
    const [petMenuOpen, setPetMenuOpen] = useState(false);
    const petWrapRef = useRef<HTMLDivElement | null>(null);
    const [petMenuStyle, setPetMenuStyle] = useState<React.CSSProperties>({});
    const linkedDirs = projectMetadata?.linkedDirs ?? [];
    const visibleWorkspaceContext =
      activeWorkspaceContext && activeWorkspaceContext.id !== dismissedWorkspaceContextId
        ? activeWorkspaceContext
        : null;
    const selectedWorkspaceContexts = useMemo(() => {
      const out: WorkspaceContextItem[] = [];
      const seen = new Set<string>();
      const push = (item: WorkspaceContextItem | null | undefined) => {
        if (!item) return;
        const key = `${item.kind}:${item.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(item);
      };
      push(visibleWorkspaceContext);
      for (const item of stagedWorkspaceContexts) push(item);
      return out;
    }, [stagedWorkspaceContexts, visibleWorkspaceContext]);
    // initialDraft is only honored on the first non-empty value the parent
    // hands us. After we seed once, the composer is fully under user control
    // — re-renders that pass the same prompt back must not reseed. If the
    // initial useState above already consumed a non-empty initialDraft we
    // mark it seeded immediately, so an early clear by the user (typing or
    // backspace before the parent stops passing initialDraft) does not get
    // overwritten by the effect.
    const seededRef = useRef(Boolean(initialDraft));

    useEffect(() => {
      if (seededRef.current) return;
      if (initialDraft && initialDraft !== draft) {
        setDraft(initialDraft);
        seededRef.current = true;
      } else if (initialDraft === undefined) {
        seededRef.current = true;
      }
    }, [initialDraft, draft]);

    useEffect(() => {
      saveComposerDraft(draftStorageKey, draft);
    }, [draftStorageKey, draft]);

    useEffect(() => {
      if (previousWorkspaceContextIdRef.current === activeWorkspaceContextId) return;
      previousWorkspaceContextIdRef.current = activeWorkspaceContextId;
      setDismissedWorkspaceContextId(null);
    }, [activeWorkspaceContextId]);

    useEffect(() => {
      if (!toolsOpen) return;
      function onPointer(e: MouseEvent) {
        const target = e.target as Node;
        if (toolsMenuRef.current?.contains(target)) return;
        if (toolsTriggerRef.current?.contains(target)) return;
        setToolsOpen(false);
      }
      function onKey(e: KeyboardEvent) {
        if (e.key === 'Escape') setToolsOpen(false);
      }
      document.addEventListener('mousedown', onPointer);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onPointer);
        document.removeEventListener('keydown', onKey);
      };
    }, [toolsOpen]);

    useEffect(() => {
      if (!petMenuOpen) return;
      function onPointer(e: MouseEvent) {
        const target = e.target as Node;
        if (petWrapRef.current?.contains(target)) return;
        setPetMenuOpen(false);
      }
      function onKey(e: KeyboardEvent) {
        if (e.key === 'Escape') setPetMenuOpen(false);
      }
      document.addEventListener('mousedown', onPointer);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onPointer);
        document.removeEventListener('keydown', onKey);
      };
    }, [petMenuOpen]);

    // Viewport-aware pet menu positioning — flips the popover to stay
    // within screen bounds instead of clipping at the edge.
    useEffect(() => {
      if (!petMenuOpen) return;
      const wrap = petWrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const menuW = 260;
      const menuH = 200;
      const gap = 6;
      const viewW = window.innerWidth;
      const viewH = window.innerHeight;
      // Prefer opening upward (bottom of menu above the button).
      // Flip downward when there isn't enough room above.
      // When neither direction fits, clamp to viewport bounds.
      let top: number;
      if (rect.top >= menuH + gap) {
        top = rect.top - menuH - gap;
      } else if (rect.bottom + menuH + gap <= viewH) {
        top = rect.bottom + gap;
      } else {
        top = Math.max(gap, viewH - menuH - gap);
      }
      // Right-align by default (menu right edge ≈ button right edge).
      // Shift left when the menu would spill past the viewport left edge.
      const left = Math.max(8, Math.min(viewW - menuW - 8, rect.right - menuW));
      setPetMenuStyle({
        position: 'fixed',
        top,
        left,
        bottom: 'auto',
        right: 'auto',
      });
    }, [petMenuOpen]);

    useEffect(() => {
      if (!designToolboxOpen) return;
      function onPointer(e: MouseEvent) {
        const target = e.target as Node;
        if (designToolboxMenuRef.current?.contains(target)) return;
        if (designToolboxTriggerRef.current?.contains(target)) return;
        setDesignToolboxOpen(false);
      }
      function onKey(e: KeyboardEvent) {
        if (e.key === 'Escape') setDesignToolboxOpen(false);
      }
      document.addEventListener('mousedown', onPointer);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onPointer);
        document.removeEventListener('keydown', onKey);
      };
    }, [designToolboxOpen]);

    // Latch `composerEngaged` true on the first real interaction so the
    // deferred fetches below run exactly once, when they are actually needed.
    useEffect(() => {
      if (composerEngaged) return;
      if (draft.trim().length > 0 || toolsOpen || designToolboxOpen || mention || slash) {
        setComposerEngaged(true);
      }
    }, [composerEngaged, designToolboxOpen, draft, toolsOpen, mention, slash]);

    // Lazy-fetch the user's external MCP servers list (once engaged) so the
    // `/mcp …` slash palette and the composer's MCP button popover have
    // something to render. We deliberately do not reactively re-fetch when
    // the user toggles servers from Settings — the dialog refreshes itself,
    // and the chat composer rehydrates next time the user re-opens it. A
    // background poll would be cheap but unnecessary for the typical
    // edit-once-then-chat workflow.
    useEffect(() => {
      if (!composerEngaged) return;
      let cancelled = false;
      void (async () => {
        const data = await fetchMcpServers();
        if (cancelled || !data) return;
        setMcpServers(data.servers);
        setMcpTemplates(data.templates);
      })();
      return () => {
        cancelled = true;
      };
    }, [composerEngaged]);

    // Skills now come from the parent (App.tsx → ProjectView → ChatPane → ChatComposer)
    // pre-filtered by enabled/disabled state. We no longer fetch a fresh list
    // here to avoid showing skills the user has disabled via Settings.

    // Lazy-fetch installed plugins once on mount; the tools-menu Plugins
    // tab and the @-mention picker both consume this list.
    useEffect(() => {
      if (!projectId || !composerEngaged) return;
      let cancelled = false;
      void listPlugins().then((rows) => {
        if (cancelled) return;
        setInstalledPlugins(rows);
      });
      return () => {
        cancelled = true;
      };
    }, [projectId, composerEngaged]);

    useEffect(() => {
      if (!composerEngaged) return;
      let cancelled = false;
      void fetchConnectors().then((rows) => {
        if (cancelled) return;
        setConnectors(rows.filter((connector) => connector.status === 'connected'));
      });
      return () => {
        cancelled = true;
      };
    }, [composerEngaged]);

    // Composer-side plugin list: hide bundled atoms (pipeline-only). Keep
    // the full installed list available even when the project was created
    // from a pinned plugin, so users can switch or layer different plugin
    // context from the tools menu and @ picker.
    const pluginsForComposer = useMemo<InstalledPluginRecord[]>(() => {
      const allowedKinds = new Set(['skill', 'scenario', 'bundle']);
      return installedPlugins.filter((p) => {
        const k = p.manifest?.od?.kind;
        return !k || allowedKinds.has(k);
      });
    }, [installedPlugins]);

    const enabledMcpServers = useMemo(
      () => mcpServers.filter((s) => s.enabled),
      [mcpServers],
    );
    const designToolboxResourceIndex = useMemo<DesignToolboxResourceIndex>(
      () => ({
        skills,
        plugins: pluginsForComposer,
        mcpServers: enabledMcpServers,
        mcpTemplates,
        connectors,
        projectFiles,
      }),
      [connectors, enabledMcpServers, mcpTemplates, pluginsForComposer, projectFiles, skills],
    );
    const composerMentionEntities = useMemo(
      () =>
        buildComposerMentionEntities({
          connectors,
          files: projectFiles,
          mcpServers: enabledMcpServers,
          plugins: pluginsForComposer,
          skills,
          staged,
          workspaceContexts,
        }),
      [connectors, enabledMcpServers, pluginsForComposer, projectFiles, skills, staged, workspaceContexts],
    );
    // Resolve which tabs to surface in the consolidated tools popover.
    // Plugins is always visible while a project is active so users can
    // apply context without leaving the composer. MCP shows when wired by
    // the parent (App); Import is always available. Pet controls stay out
    // of the project context picker so the @ panel remains project-scoped.
    const availableTabs = useMemo<ToolsTab[]>(() => {
      const tabs: ToolsTab[] = [];
      if (projectId) {
        tabs.push('plugins');
        tabs.push('skills');
      }
      if (onOpenMcpSettings) tabs.push('mcp');
      tabs.push('import');
      return tabs;
    }, [projectId, onOpenMcpSettings]);

    // When the popover opens, snap the active tab to the first available one
    // so the user never lands on an empty / hidden tab if their config
    // changes mid-session.
    useEffect(() => {
      if (!toolsOpen) return;
      if (!availableTabs.includes(toolsTab)) {
        const first = availableTabs[0];
        if (first) setToolsTab(first);
      }
    }, [toolsOpen, availableTabs, toolsTab]);

    // Catalog of supported slash commands. Each entry shows up in the
    // popover when the user types `/` in the composer. The `insert`
    // value is what we drop into the draft when the user picks the
    // entry — usually the canonical command form with a trailing space
    // ready for an argument.
    const slashCommands = useMemo<SlashCommand[]>(() => {
      const list: SlashCommand[] = [];
      // External MCP servers — `/mcp` opens settings, `/mcp <id>` inserts a
      // prompt-side hint nudging the model to use that server's tools. The
      // hint flows through to the agent verbatim; the daemon already wired
      // the MCP config into the agent's launch so the tools are callable.
      if (onOpenMcpSettings) {
        list.push({
          id: 'mcp',
          label: '/mcp',
          insert: '/mcp ',
          descKey: 'pet.slashPet',
          icon: 'sliders',
          argHint: 'open settings · <server-id> to insert hint',
        });
      }
      for (const s of enabledMcpServers) {
        list.push({
          id: `mcp-${s.id}`,
          label: `/mcp ${s.id}`,
          insert: `Use the \`${s.id}\` MCP server tools. `,
          descKey: 'pet.slashPet',
          icon: 'sparkles',
          argHint: s.label || s.transport,
        });
      }
      if (researchAvailable) {
        list.push({
          id: 'search',
          label: '/search',
          insert: '/search ',
          descKey: 'pet.slashSearch',
          icon: 'sparkles',
          argHint: t('pet.slashSearchArg'),
        });
      }
      return list;
    }, [researchAvailable, t, enabledMcpServers, onOpenMcpSettings]);

    const filteredSlash = useMemo(() => {
      if (!slash) return [] as SlashCommand[];
      const q = slash.q.toLowerCase();
      if (!q) return slashCommands;
      return slashCommands.filter((c) => c.label.toLowerCase().includes(q));
    }, [slash, slashCommands]);

    function pickSlash(cmd: SlashCommand) {
      if (!slash) return;
      // Replace the in-flight `/<query>` trigger with the picked command's
      // canonical insertion text. Lexical owns the caret afterwards.
      editorRef.current?.replaceActiveTrigger(cmd.insert);
      editorRef.current?.focus();
      setSlash(null);
    }

    // Expand a `/hatch <concept>` draft into the canonical hatch-pet
    // skill prompt before sending. Returns null when the draft is not a
    // hatch command so the caller can fall through to the regular
    // submit path.
    function expandHatchCommand(input: string): string | null {
      const m = /^\/hatch(?:\s+([\s\S]*))?$/i.exec(input.trim());
      if (!m) return null;
      const concept = m[1]?.trim() ?? '';
      const intro = concept
        ? `Hatch a Codex-compatible animated pet for me. Concept: ${concept}.`
        : 'Hatch a Codex-compatible animated pet for me.';
      return [
        intro,
        '',
        'Use the @hatch-pet skill end-to-end:',
        '1. Generate the base look with $imagegen.',
        '2. Generate every row strip (idle, running-right, waving, jumping, failed, waiting, running, review).',
        '3. Mirror running-left from running-right only when the design is symmetric.',
        '4. Run the deterministic scripts (extract / compose / validate / contact-sheet / videos).',
        '5. Package the result into ${CODEX_HOME:-$HOME/.codex}/pets/<pet-name>/ with pet.json + spritesheet.webp.',
        '',
        'When the spritesheet is saved, tell me the absolute path and the pet folder name. I will adopt it from Settings → Pets → Recently hatched.',
      ].join('\n');
    }

    // `/mcp` (no arg) opens settings on the External MCP tab — pure UX hook,
    // never sent to the agent. `/mcp <id>` is intentionally NOT intercepted
    // here: the slash palette already replaces it with a natural-language
    // hint sentence ("Use the `<id>` MCP server tools."), and the user is
    // expected to keep typing the rest of the prompt before sending.
    function tryHandleMcpSlash(): boolean {
      if (!onOpenMcpSettings) return false;
      const trimmed = draft.trim();
      if (!/^\/mcp\s*$/i.test(trimmed)) return false;
      onOpenMcpSettings();
      setDraft('');
      editorRef.current?.clear();
      return true;
    }

    function expandSearchCommand(input: string): { prompt: string; query: string } | null {
      const m = /^\/search(?:\s+([\s\S]*))?$/i.exec(input.trim());
      if (!m) return null;
      const query = m[1]?.trim() ?? '';
      if (!query) return null;
      return {
        query,
        prompt: [
          `Search for: ${query}`,
          '',
          'Before answering, your first tool action must be the OD research command for your shell.',
          'POSIX: "$OD_NODE_BIN" "$OD_BIN" research search --query "<search query>" --max-sources 5',
          'PowerShell: & $env:OD_NODE_BIN $env:OD_BIN research search --query "<search query>" --max-sources 5',
          'cmd.exe: "%OD_NODE_BIN%" "%OD_BIN%" research search --query "<search query>" --max-sources 5',
          'Use the canonical query below as the exact search query, with safe quoting for your shell.',
          '',
          'Canonical query:',
          '',
          '```text',
          query.replace(/```/g, '`\u200b`\u200b`'),
          '```',
          'If the OD command fails because Tavily is not configured or unavailable, report that error, then use your own search capability as fallback and label the fallback clearly.',
          'After the command returns JSON or fallback search results, write a reusable Markdown report into Design Files at `research/<safe-query-slug>.md` or another fresh project-relative path.',
          'The report must include the query, fetched time, short summary, key findings, source list with [1], [2] citations, and a note that source content is external untrusted evidence.',
          'Then summarize the findings with citations by source index and mention the Markdown report path.',
        ].join('\n'),
      };
    }

    // Parse a `/pet [arg]` slash command out of the draft. Recognized
    // forms: `/pet` (toggle wake/tuck), `/pet wake`, `/pet tuck`,
    // `/pet adopt` (open settings), or `/pet <id>` to adopt a built-in
    // by id. The slash is stripped from the draft on a successful match
    // so the user does not accidentally send the command to the agent.
    function tryHandlePetSlash(): boolean {
      if (!petEnabled) return false;
      const trimmed = draft.trim();
      const match = /^\/pet(?:\s+(\S+))?$/i.exec(trimmed);
      if (!match) return false;
      const arg = match[1]?.toLowerCase();
      if (!arg || arg === 'toggle') {
        onTogglePet?.();
      } else if (arg === 'wake' || arg === 'show') {
        if (petConfig?.adopted) {
          if (!petConfig.enabled) onTogglePet?.();
        } else {
          onOpenPetSettings?.();
        }
      } else if (arg === 'tuck' || arg === 'hide') {
        if (petConfig?.enabled) onTogglePet?.();
      } else if (arg === 'adopt' || arg === 'settings' || arg === 'change') {
        onOpenPetSettings?.();
      } else if (arg === CUSTOM_PET_ID) {
        onAdoptPet?.(CUSTOM_PET_ID);
      } else {
        const pet = BUILT_IN_PETS.find((p) => p.id === arg);
        if (pet) {
          onAdoptPet?.(pet.id);
        } else {
          return false;
        }
      }
      setDraft('');
      editorRef.current?.clear();
      return true;
    }

    useImperativeHandle(
      ref,
      () => ({
        setDraft: (text: string) => {
          setDraft(text);
          editorRef.current?.setText(text);
          editorRef.current?.focus();
          seededRef.current = true;
        },
        restoreDraft: ({ text, attachments = [], commentAttachments = [], meta }) => {
          setDraft(text);
          const orderedAttachments = normalizeChatAttachmentOrders(attachments);
          setStaged(orderedAttachments);
          nextAttachmentOrderRef.current = nextChatAttachmentOrder(orderedAttachments);
          setStagedVisualComments(commentAttachments);
          // Rebuild staged context from the queued turn's meta so the
          // plugin / connector / skill / MCP / workspace-tab bindings (and their chips) come
          // back for editing instead of being dropped. Ids resolve against the
          // currently-loaded lists; ids that no longer resolve (uninstalled
          // since queueing) are skipped rather than crashing. The applied
          // plugin is restored from its full snapshot, so it needs no lookup.
          const ctx = meta?.context;
          setStagedSkills(
            ctx?.skillIds
              ? ctx.skillIds
                  .map((id) => skills.find((s) => s.id === id))
                  .filter((s): s is SkillSummary => Boolean(s))
              : [],
          );
          setStagedMcpServers(
            ctx?.mcpServerIds
              ? ctx.mcpServerIds
                  .map((id) => mcpServers.find((s) => s.id === id))
                  .filter((s): s is McpServerConfig => Boolean(s))
              : [],
          );
          setStagedConnectors(
            ctx?.connectorIds
              ? ctx.connectorIds
                  .map((id) => connectors.find((c) => c.id === id))
                  .filter((c): c is ConnectorDetail => Boolean(c))
              : [],
          );
          setStagedWorkspaceContexts(ctx?.workspaceItems ?? []);
          setActiveAppliedPlugin(meta?.appliedPluginSnapshot ?? null);
          setUploadError(null);
          setMention(null);
          setSlash(null);
          editorRef.current?.setText(text);
          editorRef.current?.focus();
          seededRef.current = true;
        },
        focus: () => {
          editorRef.current?.focus();
        },
      }),
      [connectors, mcpServers, skills]
    );

    function reset() {
      setDraft("");
      setStaged([]);
      nextAttachmentOrderRef.current = 0;
      setStagedVisualComments([]);
      setStagedSkills([]);
      setStagedMcpServers([]);
      setStagedConnectors([]);
      setStagedWorkspaceContexts([]);
      setUploadError(null);
      setMention(null);
      setMentionTab('all');
      setSlash(null);
      editorRef.current?.clear();
    }

    function currentCommentAttachments(extra: ChatCommentAttachment[] = []): ChatCommentAttachment[] {
      return sortChatCommentAttachmentsByOrder([...commentAttachments, ...stagedVisualComments, ...extra]);
    }

    function setStreamingAnnotationSendPending(value: boolean) {
      streamingAnnotationSendPendingRef.current = value;
      setStreamingAnnotationSendPendingState(value);
    }

    function currentRunContextMeta(): ChatSendMeta | undefined {
      const skillIds = stagedSkills.map((s) => s.id);
      const pluginIds = activeAppliedPlugin ? [activeAppliedPlugin.pluginId] : [];
      const mcpServerIds = stagedMcpServers.map((s) => s.id);
      const connectorIds = stagedConnectors.map((c) => c.id);
      const workspaceItems = selectedWorkspaceContexts;
      const context: RunContextSelection = {
        ...(skillIds.length > 0 ? { skillIds } : {}),
        ...(pluginIds.length > 0 ? { pluginIds } : {}),
        ...(mcpServerIds.length > 0 ? { mcpServerIds } : {}),
        ...(connectorIds.length > 0 ? { connectorIds } : {}),
        ...(workspaceItems.length > 0 ? { workspaceItems } : {}),
      };
      const meta: ChatSendMeta = {
        ...(skillIds.length > 0 ? { skillIds } : {}),
        ...(activeAppliedPlugin
          ? {
              appliedPluginSnapshot: activeAppliedPlugin,
              appliedPluginSnapshotId: activeAppliedPlugin.snapshotId,
            }
          : {}),
        ...(Object.keys(context).length > 0 ? { context } : {}),
      };
      return Object.keys(meta).length > 0 ? meta : undefined;
    }

    function sendComposedTurn(
      prompt: string,
      attachments: ChatAttachment[],
      nextCommentAttachments: ChatCommentAttachment[],
      meta?: ChatSendMeta,
    ): boolean {
      setStreamingAnnotationSendPending(false);
      if (!prompt && attachments.length === 0 && nextCommentAttachments.length === 0) return false;
      onSend(prompt, attachments, nextCommentAttachments, meta);
      reset();
      return true;
    }

    function queueMeta(meta?: ChatSendMeta): ChatSendMeta {
      return { ...(meta ?? {}), queueOnly: true };
    }

    function replaceEditorDraft(text: string) {
      draftRef.current = text;
      setDraft(text);
      editorRef.current?.setText(text);
    }

    async function insertSkillMention(skill: SkillSummary) {
      const applied = await applyProjectSkill(skill);
      if (!applied) return;
      // Stage the skill so it rides this turn's skillIds, then insert an
      // atomic `@<name>` pill carrying the skill's real id. The onChange
      // prune keys on `skill:<id>` being present in the editor text, so the
      // chip survives until the user deletes the pill.
      setStagedSkills((prev) =>
        prev.some((s) => s.id === skill.id) ? prev : [...prev, skill],
      );
      editorRef.current?.insertMention({
        token: inlineMentionToken(skill.name),
        entity: { id: skill.id, kind: 'skill', label: skill.name },
      });
      setMention(null);
    }

    function stageSkillForCurrentTurn(skill: SkillSummary) {
      setStagedSkills((prev) =>
        prev.some((s) => s.id === skill.id) ? prev : [...prev, skill],
      );
    }

    function applyDesignToolboxPrompt(
      prompt: string,
      skill: SkillSummary | null,
    ) {
      const nextPrompt = skill
        ? `${inlineMentionToken(skill.name)}\n${prompt}`
        : prompt;
      if (skill) stageSkillForCurrentTurn(skill);
      applyDesignToolboxDraft(nextPrompt);
    }

    function applyDesignToolboxDraft(prompt: string) {
      replaceEditorDraft(prompt);
      setDesignToolboxOpen(false);
      editorRef.current?.focus();
    }

    function applyDesignToolboxAction(action: DesignToolboxAction) {
      const skill = findDesignToolboxSkill(action, skills);
      applyDesignToolboxPrompt(
        designToolboxActionPrompt({
          action,
          skill,
          workspaceItem: visibleWorkspaceContext,
          activeDraft: draft,
          resourceIndex: designToolboxResourceIndex,
        }),
        skill,
      );
    }

    function applyDesignToolboxSkill(skill: SkillSummary) {
      applyDesignToolboxPrompt(
        designToolboxSkillPrompt({
          skill,
          workspaceItem: visibleWorkspaceContext,
          activeDraft: draft,
          resourceIndex: designToolboxResourceIndex,
        }),
        skill,
      );
    }

    function applyDesignToolboxResource(resource: DesignToolboxResource) {
      if (resource.kind === 'skill') {
        applyDesignToolboxSkill(resource.skill);
        return;
      }

      const prompt = designToolboxResourcePrompt({
        resource,
        workspaceItem: visibleWorkspaceContext,
        activeDraft: draft,
        resourceIndex: designToolboxResourceIndex,
      });

      if (resource.kind === 'plugin') {
        void (async () => {
          await pluginsSectionRef.current?.applyById(resource.plugin.id, resource.plugin);
          applyDesignToolboxDraft(`${inlineMentionToken(resource.plugin.title)}\n${prompt}`);
        })();
        return;
      }

      if (resource.kind === 'mcp') {
        const label = resource.server.label || resource.server.id;
        setStagedMcpServers((current) =>
          current.some((item) => item.id === resource.server.id)
            ? current
            : [...current, resource.server],
        );
        applyDesignToolboxDraft(`${inlineMentionToken(label)}\n${prompt}`);
        return;
      }

      if (resource.kind === 'connector') {
        setStagedConnectors((current) =>
          current.some((item) => item.id === resource.connector.id)
            ? current
            : [...current, resource.connector],
        );
        applyDesignToolboxDraft(`${inlineMentionToken(resource.connector.name)}\n${prompt}`);
        return;
      }

      if (resource.kind === 'file') {
        const path = resource.file.path ?? resource.file.name;
        setStaged((current) =>
          current.some((item) => item.path === path)
            ? current
            : [
                ...current,
                {
                  path,
                  name: path.split('/').pop() || path,
                  kind: looksLikeImage(path) ? 'image' : 'file',
                },
              ],
        );
        applyDesignToolboxDraft(`${inlineMentionToken(path)}\n${prompt}`);
        return;
      }

      applyDesignToolboxDraft(prompt);
    }

    function applyLuckyDesignToolboxAction() {
      applyDesignToolboxAction(
        pickLuckyDesignToolboxAction({
          actions: DESIGN_TOOLBOX_ACTIONS,
          draft,
          projectFiles,
          workspaceItem: visibleWorkspaceContext,
        }),
      );
    }

    function removeStagedSkill(id: string) {
      const skill = stagedSkills.find((s) => s.id === id) ?? null;
      setStagedSkills((prev) => prev.filter((s) => s.id !== id));
      const labels = [id, skill?.name ?? ''];
      replaceEditorDraft(stripInlineMentionLabels(draft, labels));
    }

    function removeStagedMcpServer(id: string) {
      const server = stagedMcpServers.find((item) => item.id === id) ?? null;
      setStagedMcpServers((prev) => prev.filter((item) => item.id !== id));
      replaceEditorDraft(stripInlineMentionLabels(draft, [
        id,
        server?.label ?? '',
      ]));
    }

    function removeStagedConnector(id: string) {
      const connector = stagedConnectors.find((item) => item.id === id) ?? null;
      setStagedConnectors((prev) => prev.filter((item) => item.id !== id));
      replaceEditorDraft(stripInlineMentionLabels(draft, [
        id,
        connector?.name ?? '',
      ]));
    }

    function removeWorkspaceContext(id: string) {
      if (visibleWorkspaceContext?.id === id) setDismissedWorkspaceContextId(id);
      const workspaceItem = selectedWorkspaceContexts.find((item) => item.id === id) ?? null;
      setStagedWorkspaceContexts((prev) => prev.filter((item) => item.id !== id));
      if (workspaceItem) {
        replaceEditorDraft(stripInlineMentionLabels(draft, [
          workspaceItem.label,
          workspaceItem.id,
          workspaceItem.title ?? '',
          workspaceItem.path ?? '',
          workspaceItem.url ?? '',
        ]));
      }
    }

    async function ensureProject(): Promise<string | null> {
      if (projectId) return projectId;
      return onEnsureProject();
    }

    async function uploadFiles(files: File[]) {
      if (files.length === 0) return;
      const id = await ensureProject();
      if (!id) return;
      setUploading(true);
      setUploadError(null);
      // Cohort math is identical to the Design Files Upload button; see
      // `analytics/upload-tracking.ts`. v2 doc fires one
      // file_upload_result per surface so this path reports
      // `page_name='chat_panel'` / `area='chat_composer'`.
      const cohort = deriveUploadCohort(files);
      const orderStart = nextAttachmentOrderRef.current;
      nextAttachmentOrderRef.current += files.length;
      try {
        const result = await uploadProjectFiles(id, files);
        if (result.uploaded.length > 0) {
          const orderedUploaded = assignChatAttachmentOrders(result.uploaded, orderStart);
          setStaged((s) => sortChatAttachmentsByOrder([...s, ...orderedUploaded]));
        }
        const partial = result.failed.length > 0;
        if (partial) {
          const failedCount = result.failed.length;
          const uploadedCount = result.uploaded.length;
          const detail = result.error ? ` (${result.error})` : '';
          setUploadError(
            uploadedCount > 0
              ? `Attached ${uploadedCount} file(s), but ${failedCount} failed${detail}.`
              : `Attachment upload failed for ${failedCount} file(s)${detail}.`,
          );
          console.warn('Some attachments failed to upload', result.failed);
        }
        trackFileUploadResult(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          project_id: id,
          ...cohort,
          result: partial ? 'failed' : 'success',
          ...(partial && result.error ? { error_code: result.error } : {}),
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setUploadError(`Attachment upload failed (${detail}).`);
        trackFileUploadResult(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          project_id: id,
          ...cohort,
          result: 'failed',
          error_code: detail,
        });
      } finally {
        setUploading(false);
      }
    }

    async function uploadClipboardImagesFromAsyncClipboard() {
      if (!navigator.clipboard?.read) return false;
      try {
        const items = await navigator.clipboard.read();
        const files: File[] = [];
        const stamp = Date.now();
        for (const item of items) {
          const imageType = item.types.find((type) => type.startsWith('image/'));
          if (!imageType) continue;
          const blob = await item.getType(imageType);
          const extension = imageType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
          files.push(new File([blob], `clipboard-screenshot-${stamp}.${extension}`, { type: imageType }));
        }
        if (files.length === 0) return false;
        await uploadFiles(files);
        return true;
      } catch (err) {
        console.warn('Could not read image from clipboard', err);
        return false;
      }
    }

    useEffect(() => {
      function onAnnotation(e: Event) {
        const detail = (e as CustomEvent<AnnotationEventDetail>).detail;
        if (!detail) return;
        void (async () => {
          let acked = false;
          const ack = (result: { ok: boolean; message?: string }) => {
            if (acked) return;
            acked = true;
            detail.ack?.(result);
          };
          let uploaded: ChatAttachment[] = [];
          let visualAttachmentInput: Parameters<typeof buildVisualAnnotationAttachment>[0] | null = null;
          let visualAttachment: ChatCommentAttachment | null = null;
          try {
            // Upload the annotation screenshot together with any images the
            // user attached in the markup composer. The screenshot (when
            // present) is first so it keeps backing the structured visual
            // comment; the rest ride along as ordinary chat attachments.
            const annotationFiles = [detail.file, ...(detail.extraFiles ?? [])].filter(
              (f): f is File => Boolean(f),
            );
            if (annotationFiles.length > 0) {
              const orderStart = nextAttachmentOrderRef.current;
              nextAttachmentOrderRef.current += annotationFiles.length;
              const id = await ensureProject();
              if (!id) {
                ack({ ok: false, message: t('chat.annotationProjectCreateFailed') });
                return;
              }
              setUploading(true);
              const result = await uploadProjectFiles(id, annotationFiles);
              if (result.uploaded.length > 0) {
                uploaded = assignChatAttachmentOrders(result.uploaded, orderStart);
                const screenshot = detail.file ? uploaded[0] : null;
                if (screenshot && detail.markKind && detail.bounds) {
                  visualAttachmentInput = {
                    order: isFiniteAttachmentOrder(screenshot.order) ? screenshot.order : orderStart,
                    idSeed: screenshot.path,
                    screenshotPath: screenshot.path,
                    markKind: detail.markKind,
                    note: detail.note,
                    bounds: detail.bounds,
                    target: detail.target
                      ? {
                          filePath: detail.target.filePath || detail.filePath || screenshot.path,
                          elementId: detail.target.elementId,
                          selector: detail.target.selector,
                          label: detail.target.label,
                          text: detail.target.text,
                          position: detail.target.position,
                          htmlHint: detail.target.htmlHint,
                        }
                      : {
                          filePath: detail.filePath || screenshot.path,
                          position: detail.bounds,
                        },
                  };
                }
              }
              if (result.failed.length > 0) {
                const detailText = result.error ? ` (${result.error})` : '';
                setUploadError(`Attachment upload failed for ${result.failed.length} file(s)${detailText}.`);
                if (uploaded.length === 0) {
                  ack({ ok: false, message: t('chat.annotationUploadFailed') });
                  return;
                }
              }
            }
            setUploading(false);

            const appendAnnotationToComposer = () => {
              if (uploaded.length > 0) {
                setStaged((s) => sortChatAttachmentsByOrder([...s, ...uploaded]));
              }
              if (visualAttachmentInput) {
                setStagedVisualComments((current) => [
                  ...current,
                  buildVisualAnnotationAttachment({
                    ...visualAttachmentInput!,
                  }),
                ]);
              }
              if (detail.note) {
                // Accumulate through draftRef so two annotations resolving
                // concurrently compose (each reads the other's write) instead
                // of both starting from the same stale closure. Mirror the
                // result into the editor with setText so the now-non-empty
                // editor does not fire an onChange('') that would clobber the
                // accumulated draft back to empty.
                const nextDraft = draftRef.current
                  ? `${draftRef.current}\n${detail.note}`
                  : detail.note;
                draftRef.current = nextDraft;
                setDraft(nextDraft);
                editorRef.current?.setText(nextDraft);
              }
              editorRef.current?.focus();
            };

            if (detail.action === 'queue') {
              if (visualAttachmentInput) {
                visualAttachment = buildVisualAnnotationAttachment({
                  ...visualAttachmentInput,
                });
              }
              const prompt = [draft.trim(), detail.note].filter(Boolean).join('\n');
              const attachments = sortChatAttachmentsByOrder([...staged, ...uploaded]);
              const nextCommentAttachments = currentCommentAttachments(visualAttachment ? [visualAttachment] : []);
              sendComposedTurn(prompt, attachments, nextCommentAttachments, queueMeta(currentRunContextMeta()));
              ack({ ok: true });
              return;
            }

            if (detail.action === 'send') {
              if (streaming) {
                appendAnnotationToComposer();
                setStreamingAnnotationSendPending(true);
                ack({ ok: true });
                return;
              }
              if (visualAttachmentInput) {
                visualAttachment = buildVisualAnnotationAttachment({
                  ...visualAttachmentInput,
                });
              }
              const prompt = [draft.trim(), detail.note].filter(Boolean).join('\n');
              const attachments = sortChatAttachmentsByOrder([...staged, ...uploaded]);
              const nextCommentAttachments = currentCommentAttachments(visualAttachment ? [visualAttachment] : []);
              sendComposedTurn(prompt, attachments, nextCommentAttachments, currentRunContextMeta());
              ack({ ok: true });
              return;
            }

            if (detail.action === 'draft') {
              appendAnnotationToComposer();
              ack({ ok: true });
              return;
            }

            ack({ ok: false, message: t('chat.annotationFailed') });
          } catch (err) {
            console.warn('Could not send annotation', err);
            setUploadError(err instanceof Error ? err.message : t('chat.annotationFailed'));
            ack({ ok: false, message: t('chat.annotationFailed') });
          } finally {
            setUploading(false);
          }
        })();
      }
      window.addEventListener(ANNOTATION_EVENT, onAnnotation);
      return () => window.removeEventListener(ANNOTATION_EVENT, onAnnotation);
    }, [
      commentAttachments,
      draft,
      onSend,
      projectId,
      selectedWorkspaceContexts,
      staged,
      stagedConnectors,
      stagedMcpServers,
      stagedSkills,
      stagedVisualComments,
      streaming,
      t,
    ]);

    useEffect(() => {
      if (!streamingAnnotationSendPending || !streamingAnnotationSendPendingRef.current) return;
      if (streaming || sendDisabled) return;
      // Read the ref, not the closed-over `draft`: the accumulating annotation
      // handler writes draftRef synchronously, so the ref is authoritative even
      // if this effect's render closure predates the last accumulation.
      const prompt = draftRef.current.trim();
      sendComposedTurn(prompt, staged, currentCommentAttachments(), currentRunContextMeta());
    }, [
      commentAttachments,
      draft,
      onSend,
      selectedWorkspaceContexts,
      sendDisabled,
      staged,
      stagedConnectors,
      stagedMcpServers,
      stagedSkills,
      stagedVisualComments,
      streaming,
      streamingAnnotationSendPending,
    ]);

    // Paste handler invoked by the editor's PastePlugin. `files` are the items
    // the clipboard exposed synchronously; when empty we fall back to the
    // async Clipboard API to recover pasted screenshots that some browsers
    // only surface through `navigator.clipboard.read()`.
    function handlePasteFiles(files: File[]) {
      if (files.length > 0) {
        void uploadFiles(files);
        return;
      }
      void uploadClipboardImagesFromAsyncClipboard();
    }

    function handleDrop(e: React.DragEvent<HTMLDivElement>) {
      e.preventDefault();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length > 0) void uploadFiles(files);
    }

    async function handleLinkFolder() {
      if (!projectId) return;
      const selected = await openFolderDialog();
      if (!selected) return;
      const base = projectMetadata ?? { kind: 'prototype' as const };
      const existing = base.linkedDirs ?? [];
      if (existing.includes(selected)) return;
      const metadata: ProjectMetadata = { ...base, linkedDirs: [...existing, selected] };
      const result = await patchProject(projectId, { metadata });
      if (result?.metadata) onProjectMetadataChange?.(result.metadata);
    }

    async function handleSwitchDesignSystem(
      designSystemId: string | null,
      title: string | null,
    ): Promise<boolean> {
      if (!projectId) return false;
      if (designSystemId === currentDesignSystemId) return true;
      const result = await patchProject(projectId, { designSystemId });
      if (!result) {
        onShowToast?.(t('chat.importDesignSystemFailed'));
        return false;
      }
      onActiveDesignSystemChange?.(result);
      const switchedTitle = designSystemId === null
        ? t('chat.importDesignSystemNone')
        : title ?? designSystemId;
      onShowToast?.(t('chat.importDesignSystemSwitched', { title: switchedTitle }));
      return true;
    }

    async function handleUnlinkFolder(dir: string) {
      if (!projectId) return;
      const base = projectMetadata ?? { kind: 'prototype' as const };
      const existing = base.linkedDirs ?? [];
      const metadata: ProjectMetadata = { ...base, linkedDirs: existing.filter((d) => d !== dir) };
      const result = await patchProject(projectId, { metadata });
      if (result?.metadata) onProjectMetadataChange?.(result.metadata);
    }

    // Lexical drives every text change through this callback. `present` is the
    // entity list the editor's text currently references (MentionNodes plus
    // plain `@token`s matched against composerMentionEntities, deduped by
    // kind:id). We prune the staged skill/mcp/connector chips to whatever the
    // text still references — generalizing the old skill-only regex prune so a
    // hand-deleted token also drops its chip and never leaks into the run
    // context. `staged` (files) is intentionally NOT pruned: users attach
    // files via the upload button without leaving an `@<path>` token.
    function handleEditorChange(text: string, present: InlineMentionEntity[]) {
      draftRef.current = text;
      setDraft(text);
      const set = new Set(present.map((e) => `${e.kind}:${e.id}`));
      setStagedSkills((prev) => prev.filter((s) => set.has(`skill:${s.id}`)));
      setStagedMcpServers((prev) => prev.filter((m) => set.has(`mcp:${m.id}`)));
      setStagedConnectors((prev) =>
        prev.filter((c) => set.has(`connector:${c.id}`)),
      );
      setStagedWorkspaceContexts((prev) =>
        prev.filter((item) => set.has(`workspace:${item.id}`)),
      );
    }

    // Lexical reports the active @/slash trigger derived from the caret. The
    // mention popover state collapses to `{ q }`; the slash state replicates
    // the old detection effect (reset the keyboard index on open). IME
    // suppression already happened in the editor (it bails while composing).
    function handleEditorTrigger({
      mention: nextMention,
      slash: nextSlash,
      anchorRect,
    }: {
      mention: { q: string } | null;
      slash: { q: string } | null;
      anchorRect: CaretRect | null;
    }) {
      setCaretRect(anchorRect);
      if (nextMention && !mention) {
        setMentionTab('all');
      } else if (!nextMention) {
        setMentionTab('all');
      }
      setMention((prev) => {
        // Reset the active row only when the query identity changes (mirror of
        // the slash reset) so re-renders from unrelated state don't snap it.
        if (nextMention && (!prev || prev.q !== nextMention.q)) setMentionIndex(0);
        return nextMention;
      });
      if (nextSlash) {
        setSlash(nextSlash);
        setSlashIndex(0);
      } else {
        setSlash(null);
      }
    }

    // Routes popover navigation keys lifted verbatim from the old textarea
    // onKeyDown. Returns true when the key was consumed so the editor can
    // preventDefault; false lets the editor handle it normally (e.g. plain
    // arrow keys when no popover is open).
    function handlePopoverKey(
      key: 'ArrowDown' | 'ArrowUp' | 'Tab' | 'Enter' | 'Escape',
    ): boolean {
      if (slash && filteredSlash.length > 0) {
        if (key === 'ArrowDown') {
          setSlashIndex((i) => (i + 1) % filteredSlash.length);
          return true;
        }
        if (key === 'ArrowUp') {
          setSlashIndex(
            (i) => (i - 1 + filteredSlash.length) % filteredSlash.length,
          );
          return true;
        }
        if (key === 'Tab' || key === 'Enter') {
          const safe = Math.min(slashIndex, filteredSlash.length - 1);
          pickSlash(filteredSlash[safe]!);
          return true;
        }
        if (key === 'Escape') {
          setSlash(null);
          return true;
        }
      }
      if (mention && key === 'Escape') {
        setMention(null);
        return true;
      }
      if (mention) {
        // Drive a single index over the visible section union. MentionPopover
        // renders the same tabs-first section order and highlights the
        // matching row from activeIndex.
        const showTabs = mentionTab === 'all' || mentionTab === 'tabs';
        const showFiles = mentionTab === 'all' || mentionTab === 'files';
        const showPlugins = mentionTab === 'all' || mentionTab === 'plugins';
        const showSkills = mentionTab === 'all' || mentionTab === 'skills';
        const showMcp = mentionTab === 'all' || mentionTab === 'mcp';
        const showConnectors = mentionTab === 'all' || mentionTab === 'connectors';
        const total =
          (showTabs ? filteredWorkspaceContexts.length : 0) +
          (showFiles ? filteredFiles.length : 0) +
          (showPlugins ? filteredPlugins.length : 0) +
          (showSkills ? filteredSkills.length : 0) +
          (showMcp ? filteredMcpServers.length : 0) +
          (showConnectors ? filteredConnectors.length : 0);
        if (total > 0) {
          if (key === 'ArrowDown') {
            setMentionIndex((i) => (i + 1) % total);
            return true;
          }
          if (key === 'ArrowUp') {
            setMentionIndex((i) => (i - 1 + total) % total);
            return true;
          }
          if (key === 'Tab' || key === 'Enter') {
            pickMentionByFlatIndex(Math.min(mentionIndex, total - 1));
            return true;
          }
        }
      }
      return false;
    }

    // Resolve a flat visible-section index to the right insert call. Section
    // order MUST match MentionPopover's render order (tabs→files→plugins
    // →skills→mcp→connectors); the activeIndex highlight and Enter target stay in
    // lockstep across "All" and individual tabs.
    function pickMentionByFlatIndex(flat: number) {
      let i = flat;
      if (mentionTab === 'all' || mentionTab === 'tabs') {
        if (i < filteredWorkspaceContexts.length) {
          insertWorkspaceMention(filteredWorkspaceContexts[i]!);
          return;
        }
        i -= filteredWorkspaceContexts.length;
      }
      if (mentionTab === 'all' || mentionTab === 'files') {
        if (i < filteredFiles.length) {
          insertMention(filteredFiles[i]!.path ?? filteredFiles[i]!.name);
          return;
        }
        i -= filteredFiles.length;
      }
      if (mentionTab === 'all' || mentionTab === 'plugins') {
        if (i < filteredPlugins.length) {
          void insertPluginMention(filteredPlugins[i]!);
          return;
        }
        i -= filteredPlugins.length;
      }
      if (mentionTab === 'all' || mentionTab === 'skills') {
        if (i < filteredSkills.length) {
          void insertSkillMention(filteredSkills[i]!);
          return;
        }
        i -= filteredSkills.length;
      }
      if (mentionTab === 'all' || mentionTab === 'mcp') {
        if (i < filteredMcpServers.length) {
          insertMcpMention(filteredMcpServers[i]!);
          return;
        }
        i -= filteredMcpServers.length;
      }
      if (mentionTab === 'all' || mentionTab === 'connectors') {
        if (i < filteredConnectors.length) {
          insertConnectorMention(filteredConnectors[i]!);
          return;
        }
      }
    }

    function insertMention(filePath: string) {
      editorRef.current?.insertMention({
        token: inlineMentionToken(filePath),
        entity: { id: filePath, kind: 'file', label: filePath },
      });
      if (!staged.some((s) => s.path === filePath)) {
        setStaged((s) => [
          ...s,
          {
            path: filePath,
            name: filePath.split("/").pop() || filePath,
            kind: looksLikeImage(filePath) ? "image" : "file",
          },
        ]);
      }
      setMention(null);
    }

    async function insertPluginMention(record: InstalledPluginRecord) {
      editorRef.current?.insertMention({
        token: inlineMentionToken(record.title),
        entity: { id: record.id, kind: 'plugin', label: record.title },
      });
      setMention(null);
      await pluginsSectionRef.current?.applyById(record.id, record);
    }

    function insertMcpMention(server: McpServerConfig) {
      setStagedMcpServers((current) => (
        current.some((item) => item.id === server.id) ? current : [...current, server]
      ));
      editorRef.current?.insertMention({
        token: inlineMentionToken(server.label || server.id),
        entity: { id: server.id, kind: 'mcp', label: server.label || server.id },
      });
      setMention(null);
    }

    function insertConnectorMention(connector: ConnectorDetail) {
      setStagedConnectors((current) => (
        current.some((item) => item.id === connector.id) ? current : [...current, connector]
      ));
      editorRef.current?.insertMention({
        token: inlineMentionToken(connector.name),
        entity: { id: connector.id, kind: 'connector', label: connector.name },
      });
      setMention(null);
    }

    function insertWorkspaceMention(item: WorkspaceContextItem) {
      setStagedWorkspaceContexts((current) =>
        current.some((candidate) => candidate.id === item.id)
          ? current
          : [...current, item],
      );
      editorRef.current?.insertMention({
        token: inlineMentionToken(item.label),
        entity: { id: item.id, kind: 'workspace', label: item.label },
      });
      setMention(null);
    }

    async function applyProjectSkill(skill: SkillSummary): Promise<boolean> {
      if (!projectId) return false;
      const result = await patchProject(projectId, { skillId: skill.id });
      if (!result) return false;
      onProjectSkillChange?.(result.skillId ?? skill.id);
      return true;
    }

    function removeStaged(p: string) {
      setStaged((s) => s.filter((a) => a.path !== p));
      setStagedVisualComments((current) => current.filter((attachment) => attachment.screenshotPath !== p));
      // Strip the `@<path>` token from the draft and push the result back into
      // the editor so the pill disappears in lockstep with the chip.
      replaceEditorDraft(stripInlineMentionToken(draft, p));
    }

    function removeCommentAttachment(id: string) {
      setStagedVisualComments((current) => current.filter((attachment) => attachment.id !== id));
      if (!stagedVisualComments.some((attachment) => attachment.id === id)) {
        onRemoveCommentAttachment?.(id);
      }
    }

    async function submit() {
      const prompt = draft.trim();
      if (sendDisabled) return;
      // Intercept `/pet …` and `/mcp` before sending so the slash command
      // never hits the agent — these are local UX hooks, not model prompts.
      if (tryHandlePetSlash()) return;
      if (tryHandleMcpSlash()) return;
      // `/hatch <concept>` expands into the canonical hatch-pet skill
      // prompt and *is* sent to the agent — the agent runs the skill,
      // packages a Codex pet under `~/.codex/pets/`, and the user
      // adopts it from "Recently hatched" in pet settings afterwards.
      const contextMeta = currentRunContextMeta();
      const hatched = expandHatchCommand(prompt);
      const nextCommentAttachments = currentCommentAttachments();
      if (hatched) {
        if (streaming) return;
        setStreamingAnnotationSendPending(false);
        onSend(hatched, staged, nextCommentAttachments, contextMeta);
        reset();
        return;
      }
      const search = researchAvailable ? expandSearchCommand(prompt) : null;
      if (search) {
        if (streaming) return;
        setStreamingAnnotationSendPending(false);
        onSend(search.prompt, staged, nextCommentAttachments, {
          ...contextMeta,
          research: { enabled: true, query: search.query },
        });
        reset();
        return;
      }
      if (!prompt && staged.length === 0 && nextCommentAttachments.length === 0) return;
      sendComposedTurn(prompt, staged, nextCommentAttachments, contextMeta);
    }

    // The @-picker offers a unified search across context surfaces:
    // workspace tabs first, then project files, plugins, skills, active MCP
    // servers, and connectors. Picked
    // entities keep an inline @ token for orientation while richer
    // context is still applied behind the scenes when available.
    const mentionQuery = mention ? mention.q.toLowerCase() : '';
    // The suggestion lists below only matter while the @-popover is open
    // (each is `[]` otherwise). Memoize them on `[mention, mentionQuery,
    // <source>]` so the filter/sort passes run only when the query or the
    // backing list actually changes — not on every unrelated composer render
    // (streaming flips, draft typing routed through Lexical, staged-chip churn).
    // `mention` is in the deps (not just `mentionQuery`) so the open/close gate
    // re-evaluates: a null→{q:''} transition keeps the query '' but must flip
    // the list from `[]` to live results.
    const filteredWorkspaceContexts = useMemo(
      () =>
        mention
          ? workspaceContexts
              .filter((item) => {
                if (!mentionQuery) return true;
                return workspaceContextSearchText(item).toLowerCase().includes(mentionQuery);
              })
              .slice(0, 12)
          : [],
      [mention, mentionQuery, workspaceContexts],
    );
    const filteredFiles = useMemo(
      () =>
        mention
          ? projectFiles
              .filter((f) => f.type === undefined || f.type === "file")
              .filter((f) => {
                const key = f.path ?? f.name;
                return key.toLowerCase().includes(mentionQuery);
              })
              .slice(0, 12)
          : [],
      [mention, mentionQuery, projectFiles],
    );
    const filteredPlugins = useMemo(
      () =>
        mention
          ? pluginsForComposer
              .filter((p) => {
                if (!mentionQuery) return true;
                return (
                  p.title.toLowerCase().includes(mentionQuery) ||
                  p.id.toLowerCase().includes(mentionQuery) ||
                  (p.manifest?.description ?? '').toLowerCase().includes(mentionQuery) ||
                  (p.manifest?.tags ?? []).join(' ').toLowerCase().includes(mentionQuery)
                );
              })
              .slice(0, 8)
          : [],
      [mention, mentionQuery, pluginsForComposer],
    );
    const filteredMcpServers = useMemo(
      () =>
        mention
          ? enabledMcpServers
              .filter((s) => {
                if (!mentionQuery) return true;
                return [
                  s.id,
                  s.label ?? '',
                  s.transport,
                  s.url ?? '',
                  s.command ?? '',
                ]
                  .join(' ')
                  .toLowerCase()
                  .includes(mentionQuery);
              })
              .slice(0, 8)
          : [],
      [mention, mentionQuery, enabledMcpServers],
    );
    const filteredConnectors = useMemo(
      () =>
        mention
          ? connectors
              .filter((connector) => {
                if (!mentionQuery) return true;
                return [
                  connector.id,
                  connector.name,
                  connector.provider,
                  connector.category,
                  connector.description ?? '',
                  connector.accountLabel ?? '',
                ]
                  .join(' ')
                  .toLowerCase()
                  .includes(mentionQuery);
              })
              .slice(0, 8)
          : [],
      [mention, mentionQuery, connectors],
    );
    // Already-staged skills drop out of the suggestion list (carried over
    // from main) so the @-popover keeps moving forward as the user picks.
    const filteredSkills = useMemo(() => {
      if (!mention) return [];
      const stagedSkillIds = new Set(stagedSkills.map((s) => s.id));
      return skills
        .filter((s) => !stagedSkillIds.has(s.id))
        .filter((s) => skillMatchesQuery(s, mentionQuery))
        .sort((a, b) => skillMentionRank(a, mentionQuery) - skillMentionRank(b, mentionQuery));
    }, [mention, mentionQuery, skills, stagedSkills]);
    const hasComposerPayload =
      draft.trim().length > 0 || staged.length > 0 || currentCommentAttachments().length > 0;
    const showStopButton = streaming && !hasComposerPayload;
    const showSendButton = !streaming || hasComposerPayload;

    return (
      <div
        className={`composer${dragActive ? " drag-active" : ""}`}
        data-testid="chat-composer"
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <div className="composer-shell">
          {/*
            Spec §8.4 — context bar above the composer input. The
            section now behaves as a pure context bar: it renders the
            active plugin's chips + inputs form when one is applied,
            but never the always-on rail. Plugins are picked from the
            tools-menu Plugins tab or the @-mention popover so the
            composer chrome stays out of the way until the user wants
            to attach context.
          */}
          {projectId ? (
            <PluginsSection
              ref={pluginsSectionRef}
              projectId={projectId}
              showRail={false}
              onApplied={(brief, applied) => {
                setActiveAppliedPlugin(applied.appliedPlugin);
                // Use functional setState so stale closures from the @-mention
                // flow (which awaits applyById after setDraft) still see the
                // latest draft value before deciding whether to seed.
                if (typeof brief === 'string' && brief.length > 0) {
                  setDraft((cur) => (cur.trim().length === 0 ? brief : cur));
                }
              }}
              onCleared={() => setActiveAppliedPlugin(null)}
              onChipDetails={(item: ContextItem) => {
                if (item.kind !== 'plugin') return;
                const record = installedPlugins.find((p) => p.id === item.id);
                if (record) setDetailsRecord(record);
              }}
            />
          ) : null}
          {selectedWorkspaceContexts.length > 0 || stagedSkills.length > 0 || stagedMcpServers.length > 0 || stagedConnectors.length > 0 ? (
            <StagedRunContexts
              workspaceItems={selectedWorkspaceContexts}
              currentWorkspaceContextId={visibleWorkspaceContext?.id ?? null}
              skills={stagedSkills}
              mcpServers={stagedMcpServers}
              connectors={stagedConnectors}
              onRemoveWorkspace={removeWorkspaceContext}
              onRemoveSkill={removeStagedSkill}
              onRemoveMcp={removeStagedMcpServer}
              onRemoveConnector={removeStagedConnector}
              t={t}
            />
          ) : null}
          {staged.length > 0 ? (
            <StagedAttachments
              attachments={staged}
              projectId={projectId}
              onRemove={removeStaged}
              t={t}
            />
          ) : null}
          {linkedDirs.length > 0 ? (
            <div className="linked-dirs-row" data-testid="linked-dirs">
              {linkedDirs.map((dir) => (
                <div key={dir} className="linked-dir-chip">
                  <Icon name="folder" size={13} />
                  <span className="linked-dir-name" title={dir}>
                    {dir.split('/').pop() || dir}
                  </span>
                  <button
                    className="staged-remove"
                    onClick={() => handleUnlinkFolder(dir)}
                    title={t('chat.linkedFolderRemoveAria', { path: dir })}
                    aria-label={t('chat.linkedFolderRemoveAria', { path: dir })}
                  >
                    <Icon name="close" size={11} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {currentCommentAttachments().length > 0 ? (
            <StagedCommentAttachments
              attachments={currentCommentAttachments()}
              onRemove={removeCommentAttachment}
              t={t}
            />
          ) : null}
          {byokApiProtocol === 'senseaudio' && onChangeByokImageModel ? (
            <div
              className="composer-byok-image-model"
              data-testid="composer-byok-image-model"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px',
                fontSize: 12,
                color: 'var(--text-muted, #888)',
              }}
            >
              <Icon name="image" size={13} />
              <label
                htmlFor="composer-byok-image-model-select"
                style={{ flexShrink: 0 }}
              >
                {t('settings.byokImageModel')}
              </label>
              <select
                id="composer-byok-image-model-select"
                value={byokImageModel ?? ''}
                onChange={(e) => onChangeByokImageModel(e.target.value)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border, #444)',
                  borderRadius: 4,
                  padding: '2px 6px',
                  color: 'inherit',
                  fontSize: 12,
                }}
              >
                <option value="">
                  {(IMAGE_MODELS.find((m) => m.provider === 'senseaudio')?.label
                    ?? 'senseaudio-image-2.0') + ' (default)'}
                </option>
                {IMAGE_MODELS.filter((m) => m.provider === 'senseaudio').map(
                  (m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ),
                )}
              </select>
            </div>
          ) : null}
          <div
            className="composer-input-wrap"
            onFocus={() => setComposerEngaged(true)}
          >
            <LexicalComposerInput
              ref={editorRef}
              draft={draft}
              placeholder={t('chat.composerPlaceholder')}
              title={t('chat.composerPlaceholder')}
              knownEntities={composerMentionEntities}
              onChange={handleEditorChange}
              onTrigger={handleEditorTrigger}
              onEnterSend={() => void submit()}
              onPasteFiles={handlePasteFiles}
              popoverOpen={Boolean(mention) || Boolean(slash && filteredSlash.length > 0)}
              onPopoverKey={handlePopoverKey}
              comboboxAria={{
                expanded: Boolean(mention),
                activeId: mention ? `mention-opt-${mentionIndex}` : null,
              }}
            />
          </div>
          <CaretFloatingLayer caret={caretRect} open={Boolean(mention)}>
            <MentionPopover
              files={filteredFiles}
              workspaceContexts={filteredWorkspaceContexts}
              plugins={filteredPlugins}
              skills={filteredSkills}
              mcpServers={filteredMcpServers}
              connectors={filteredConnectors}
              query={mention?.q ?? ''}
              tab={mentionTab}
              onTabChange={(nextTab) => {
                setMentionTab(nextTab);
                setMentionIndex(0);
              }}
              activeIndex={mentionIndex}
              currentSkillId={currentSkillId}
              onPickFile={insertMention}
              onPickWorkspaceContext={insertWorkspaceMention}
              onPickPlugin={(record) => void insertPluginMention(record)}
              onPickSkill={(skill) => void insertSkillMention(skill)}
              onPickMcp={insertMcpMention}
              onPickConnector={insertConnectorMention}
            />
          </CaretFloatingLayer>
          <CaretFloatingLayer
            caret={caretRect}
            open={Boolean(slash && filteredSlash.length > 0)}
          >
            <SlashPopover
              commands={filteredSlash}
              activeIndex={Math.min(slashIndex, filteredSlash.length - 1)}
              onPick={pickSlash}
              onHover={(i) => setSlashIndex(i)}
              t={t}
            />
          </CaretFloatingLayer>
          <div className="composer-row">
            <input
              ref={fileInputRef}
              data-testid="chat-file-input"
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                void uploadFiles(files);
                e.target.value = '';
              }}
            />
            <div className="composer-tools-wrap">
              <button
                ref={toolsTriggerRef}
                type="button"
                className={`icon-btn composer-tools-trigger od-tooltip${toolsOpen ? ' active' : ''}`}
                onClick={() => {
                  setToolsOpen((v) => {
                    const next = !v;
                    if (next) {
                      setDesignToolboxOpen(false);
                      // P0 ui_click resources_popover_trigger — only emit on
                      // the open transition so accidental double-clicks
                      // don't pair an open + close into a "double tap" the
                      // dashboard can't interpret.
                      trackChatPanelClick(analytics.track, {
                        page_name: 'chat_panel',
                        area: 'chat_panel',
                        element: 'resources_popover_trigger',
                      });
                    }
                    return next;
                  });
                }}
                title={t('chat.cliSettingsTitle')}
                data-tooltip={t('chat.cliSettingsTitle')}
                aria-haspopup="menu"
                aria-expanded={toolsOpen}
                aria-label={t('chat.cliSettingsAria')}
              >
                <span className="composer-tools-at" aria-hidden>
                  @
                </span>
              </button>
              {toolsOpen ? (
                <div
                  ref={toolsMenuRef}
                  className="composer-tools-menu"
                  role="menu"
                >
                  <div className="composer-tools-tabs" role="tablist">
                    {availableTabs.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={toolsTab === tab}
                        className={`composer-tools-tab${toolsTab === tab ? ' active' : ''}`}
                        onClick={() => setToolsTab(tab)}
                      >
                        {tab === 'plugins' ? (
                          <>
                            <Icon name="sparkles" size={12} />
                            <span>Plugins</span>
                          </>
                        ) : null}
                        {tab === 'skills' ? (
                          <>
                            <Icon name="file" size={12} />
                            <span>Skills</span>
                          </>
                        ) : null}
                        {tab === 'mcp' ? (
                          <>
                            <Icon name="link" size={12} />
                            <span>MCP</span>
                          </>
                        ) : null}
                        {tab === 'import' ? (
                          <>
                            <Icon name="import" size={12} />
                            <span>{t('chat.importLabel')}</span>
                          </>
                        ) : null}
                      </button>
                    ))}
                  </div>

                  <div className="composer-tools-content">
                    {toolsTab === 'plugins' ? (
                      <ToolsPluginsPanel
                        plugins={pluginsForComposer}
                        activePluginId={activeAppliedPlugin?.pluginId ?? pinnedPluginId}
                        onApply={async (record) => {
                          const result = await pluginsSectionRef.current?.applyById(
                            record.id,
                            record,
                          );
                          if (result) setToolsOpen(false);
                        }}
                        onShowDetails={(record) => {
                          setDetailsRecord(record);
                          setToolsOpen(false);
                        }}
                      />
                    ) : null}
                    {toolsTab === 'skills' ? (
                      <ToolsSkillsPanel
                        skills={skills}
                        currentSkillId={currentSkillId}
                        onPick={async (skill) => {
                          const applied = await applyProjectSkill(skill);
                          if (!applied) return;
                          // Mirror the @-picker skill insert: stage the skill
                          // and drop an atomic `@<name>` pill at the caret.
                          setStagedSkills((prev) =>
                            prev.some((s) => s.id === skill.id)
                              ? prev
                              : [...prev, skill],
                          );
                          editorRef.current?.insertMention({
                            token: inlineMentionToken(skill.name),
                            entity: { id: skill.id, kind: 'skill', label: skill.name },
                          });
                          editorRef.current?.focus();
                          setToolsOpen(false);
                        }}
                      />
                    ) : null}
                    {toolsTab === 'mcp' && onOpenMcpSettings ? (
                      <ToolsMcpPanel
                        servers={enabledMcpServers}
                        templates={mcpTemplates}
                        onInsert={(serverId) => {
                          const server = enabledMcpServers.find((item) => item.id === serverId);
                          const label = server?.label || serverId;
                          // Stage the server and insert an atomic `@<label>`
                          // pill carrying its id, matching the @-picker path.
                          setStagedMcpServers((current) =>
                            current.some((item) => item.id === serverId)
                              ? current
                              : server
                                ? [...current, server]
                                : current,
                          );
                          editorRef.current?.insertMention({
                            token: inlineMentionToken(label),
                            entity: { id: serverId, kind: 'mcp', label },
                          });
                          editorRef.current?.focus();
                          setToolsOpen(false);
                        }}
                        onManage={() => {
                          setToolsOpen(false);
                          onOpenMcpSettings?.();
                        }}
                      />
                    ) : null}
                    {toolsTab === 'import' ? (
                      <ToolsImportPanel
                        t={t}
                        onLinkFolder={async () => {
                          setToolsOpen(false);
                          await handleLinkFolder();
                        }}
                        currentDesignSystemId={currentDesignSystemId}
                        onSwitchDesignSystem={
                          projectId
                            ? async (designSystemId, title) => {
                                const ok = await handleSwitchDesignSystem(
                                  designSystemId,
                                  title,
                                );
                                if (ok) setToolsOpen(false);
                                return ok;
                              }
                            : undefined
                        }
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="composer-design-toolbox-wrap">
              <button
                ref={designToolboxTriggerRef}
                type="button"
                className={`icon-btn composer-toolbox-trigger od-tooltip${designToolboxOpen ? ' active' : ''}`}
                onClick={() => {
                  setDesignToolboxOpen((v) => {
                    const next = !v;
                    if (next) {
                      setComposerEngaged(true);
                      setToolsOpen(false);
                    }
                    return next;
                  });
                }}
                title="设计百宝箱 / Feel lucky"
                data-tooltip="设计百宝箱 / Feel lucky"
                aria-haspopup="menu"
                aria-expanded={designToolboxOpen}
                aria-label="打开设计百宝箱"
              >
                <Icon name="lightbulb" size={15} />
              </button>
              {designToolboxOpen ? (
                <div
                  ref={designToolboxMenuRef}
                  className="composer-design-toolbox-menu"
                  role="menu"
                >
                  <DesignToolboxPanel
                    actions={DESIGN_TOOLBOX_ACTIONS}
                    skills={skills}
                    plugins={pluginsForComposer}
                    mcpServers={enabledMcpServers}
                    mcpTemplates={mcpTemplates}
                    connectors={connectors}
                    projectFiles={projectFiles}
                    activeSkillIds={stagedSkills.map((skill) => skill.id)}
                    activePluginId={activeAppliedPlugin?.pluginId ?? pinnedPluginId ?? null}
                    activeMcpServerIds={stagedMcpServers.map((server) => server.id)}
                    activeConnectorIds={stagedConnectors.map((connector) => connector.id)}
                    activeFilePaths={staged.map((item) => item.path)}
                    onLucky={applyLuckyDesignToolboxAction}
                    onPickAction={applyDesignToolboxAction}
                    onPickSkill={applyDesignToolboxSkill}
                    onPickResource={applyDesignToolboxResource}
                  />
                </div>
              ) : null}
            </div>
            {petEnabled ? (
              <div className="composer-pet-wrap" ref={petWrapRef}>
                <button
                  type="button"
                  className={`composer-pet${petConfig?.adopted ? ' adopted' : ''}`}
                  onClick={() => {
                    if (petConfig?.adopted) {
                      if (!petConfig.enabled) setPetMenuOpen(true);
                      else setPetMenuOpen((v) => !v);
                    } else {
                      setPetMenuOpen((v) => !v);
                    }
                  }}
                  title={t('pet.composerTitle')}
                  aria-haspopup="menu"
                  aria-expanded={petMenuOpen}
                  aria-label={t('pet.composerTitle')}
                >
                  <span className="composer-pet-glyph">
                    {petConfig?.adopted ? (petConfig?.custom?.glyph || '🐾') : '🐾'}
                  </span>
                  <span className="composer-pet-label">
                    {petConfig?.adopted ? (petConfig?.custom?.name || 'Buddy') : t('pet.composerMenuTitle')}
                  </span>
                </button>
                {petMenuOpen ? (
                  <div
                    className="composer-pet-menu"
                    style={petMenuStyle}
                  >
                    <div className="composer-pet-menu-head">
                      <strong>{t('pet.composerMenuTitle')}</strong>
                      <span>{t('pet.composerMenuHint')}</span>
                    </div>
                    <button
                      type="button"
                      className="composer-pet-menu-row toggle"
                      onClick={() => {
                        if (petConfig?.adopted) {
                          onTogglePet?.();
                        } else {
                          onOpenPetSettings?.();
                        }
                        setPetMenuOpen(false);
                      }}
                    >
                      <Icon name={petConfig?.enabled ? 'eye-off' : 'eye'} size={12} />
                      <span>{petConfig?.enabled ? t('pet.tuck') : t('pet.wake')}</span>
                    </button>
                    <button
                      type="button"
                      className="composer-pet-menu-row settings"
                      onClick={() => {
                        onOpenPetSettings?.();
                        setPetMenuOpen(false);
                      }}
                    >
                      <Icon name="settings" size={12} />
                      <span>{t('pet.composerOpenSettings')}</span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <Button
              size="icon"
              data-testid="chat-attach"
              onClick={() => {
                trackChatPanelClick(analytics.track, {
                  page_name: 'chat_panel',
                  area: 'chat_panel',
                  element: 'attachment',
                });
                fileInputRef.current?.click();
              }}
              title={t('chat.attachTitle')}
              data-tooltip={t('chat.attachTitle')}
              disabled={uploading}
              aria-label={t('chat.attachAria')}
            >
              {uploading ? (
                <Icon name="spinner" size={15} />
              ) : (
                <Icon name="attach" size={15} />
              )}
            </Button>
            <SessionModeToggle
              mode={sessionMode}
              onChange={onSessionModeChange}
            />
            {footerAccessory}
            <span className="composer-spacer" />
            {showStopButton ? (
              <button
                type="button"
                className="composer-send stop od-tooltip"
                onClick={onStop}
                title={t('chat.stop')}
                data-tooltip={t('chat.stop')}
                aria-label={t('chat.stop')}
              >
                <Icon name="stop" size={13} />
                <span>{t('chat.stop')}</span>
              </button>
            ) : null}
            {showSendButton ? (
              <button
                type="button"
                className="composer-send od-tooltip"
                data-testid="chat-send"
                onClick={() => {
                  trackChatPanelClick(analytics.track, {
                    page_name: 'chat_panel',
                    area: 'chat_panel',
                    element: 'send',
                  });
                  void submit();
                }}
                disabled={sendDisabled || !hasComposerPayload}
                aria-label={t('chat.send')}
                title={t('chat.send')}
                data-tooltip={t('chat.send')}
              >
                <Icon name="send" size={13} />
                <span>{t('chat.send')}</span>
              </button>
            ) : null}
          </div>
        </div>
        {uploadError ? <span className="composer-hint">{uploadError}</span> : null}
        {detailsRecord ? (
          <PluginDetailsModal
            record={detailsRecord}
            onClose={() => setDetailsRecord(null)}
            onUse={async (record) => {
              await pluginsSectionRef.current?.applyById(record.id, record);
              setDetailsRecord(null);
            }}
          />
        ) : null}
      </div>
    );
  }
);

function buildComposerMentionEntities({
  connectors,
  files,
  mcpServers,
  plugins,
  skills,
  staged,
  workspaceContexts,
}: {
  connectors: ConnectorDetail[];
  files: ProjectFile[];
  mcpServers: McpServerConfig[];
  plugins: InstalledPluginRecord[];
  skills: SkillSummary[];
  staged: ChatAttachment[];
  workspaceContexts: WorkspaceContextItem[];
}): InlineMentionEntity[] {
  const entities: InlineMentionEntity[] = [];
  const workspaceSeen = new Set<string>();
  for (const item of workspaceContexts) {
    if (!item.id || !item.label) continue;
    const key = `workspace:${item.id}`;
    if (workspaceSeen.has(key)) continue;
    workspaceSeen.add(key);
    entities.push({
      id: item.id,
      kind: 'workspace',
      label: item.label,
      token: inlineMentionToken(item.label),
      title: `Workspace: ${item.label}`,
    });
  }
  for (const plugin of plugins) {
    entities.push({
      id: plugin.id,
      kind: 'plugin',
      label: plugin.title,
      token: inlineMentionToken(plugin.title),
      title: `Plugin: ${plugin.title}`,
    });
  }
  for (const skill of skills) {
    entities.push({
      id: skill.id,
      kind: 'skill',
      label: skill.name,
      token: inlineMentionToken(skill.name),
      title: `Skill: ${skill.name}`,
    });
    if (skill.id !== skill.name) {
      entities.push({
        id: skill.id,
        kind: 'skill',
        label: skill.id,
        token: inlineMentionToken(skill.id),
        title: `Skill: ${skill.name}`,
      });
    }
  }
  for (const server of mcpServers) {
    const label = server.label || server.id;
    entities.push({
      id: server.id,
      kind: 'mcp',
      label,
      token: inlineMentionToken(label),
      title: `MCP: ${label}`,
    });
    if (server.id !== label) {
      entities.push({
        id: server.id,
        kind: 'mcp',
        label: server.id,
        token: inlineMentionToken(server.id),
        title: `MCP: ${label}`,
      });
    }
  }
  for (const connector of connectors) {
    entities.push({
      id: connector.id,
      kind: 'connector',
      label: connector.name,
      token: inlineMentionToken(connector.name),
      title: `Connector: ${connector.name}`,
    });
    if (connector.id !== connector.name) {
      entities.push({
        id: connector.id,
        kind: 'connector',
        label: connector.id,
        token: inlineMentionToken(connector.id),
        title: `Connector: ${connector.name}`,
      });
    }
  }
  const filePaths = new Set<string>();
  for (const file of files) {
    const path = file.path ?? file.name;
    if (!path || filePaths.has(path)) continue;
    filePaths.add(path);
    entities.push({
      id: path,
      kind: 'file',
      label: path,
      token: inlineMentionToken(path),
      title: `File: ${path}`,
    });
  }
  for (const attachment of staged) {
    if (!attachment.path || filePaths.has(attachment.path)) continue;
    filePaths.add(attachment.path);
    entities.push({
      id: attachment.path,
      kind: 'file',
      label: attachment.path,
      token: inlineMentionToken(attachment.path),
      title: `File: ${attachment.path}`,
    });
  }
  return entities;
}

function isFiniteAttachmentOrder(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizeChatAttachmentOrders(attachments: ChatAttachment[]): ChatAttachment[] {
  let fallbackOrder = 0;
  return attachments.map((attachment) => {
    if (isFiniteAttachmentOrder(attachment.order)) {
      fallbackOrder = Math.max(fallbackOrder, Math.floor(attachment.order) + 1);
      return { ...attachment, order: Math.floor(attachment.order) };
    }
    const order = fallbackOrder;
    fallbackOrder += 1;
    return { ...attachment, order };
  });
}

function assignChatAttachmentOrders(
  attachments: ChatAttachment[],
  orderStart: number,
): ChatAttachment[] {
  return attachments.map((attachment, index) => ({
    ...attachment,
    order: orderStart + index,
  }));
}

function nextChatAttachmentOrder(attachments: ChatAttachment[]): number {
  return attachments.reduce(
    (max, attachment, index) =>
      Math.max(max, isFiniteAttachmentOrder(attachment.order) ? Math.floor(attachment.order) + 1 : index + 1),
    0,
  );
}

function sortChatAttachmentsByOrder(attachments: ChatAttachment[]): ChatAttachment[] {
  return attachments
    .map((attachment, index) => ({ attachment, index }))
    .sort((a, b) => {
      const aOrder = isFiniteAttachmentOrder(a.attachment.order) ? a.attachment.order : a.index;
      const bOrder = isFiniteAttachmentOrder(b.attachment.order) ? b.attachment.order : b.index;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map((entry) => entry.attachment);
}

function sortChatCommentAttachmentsByOrder(attachments: ChatCommentAttachment[]): ChatCommentAttachment[] {
  return attachments
    .map((attachment, index) => ({ attachment, index }))
    .sort((a, b) => {
      const aOrder = isFiniteAttachmentOrder(a.attachment.order) ? a.attachment.order : a.index;
      const bOrder = isFiniteAttachmentOrder(b.attachment.order) ? b.attachment.order : b.index;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map((entry) => entry.attachment);
}

function StagedAttachments({
  attachments,
  projectId,
  onRemove,
  t,
}: {
  attachments: ChatAttachment[];
  projectId: string | null;
  onRemove: (path: string) => void;
  t: TranslateFn;
}) {
  const [preview, setPreview] = useState<ChatAttachment | null>(null);
  const previewUrl = preview && projectId ? projectRawUrl(projectId, preview.path) : null;

  useEffect(() => {
    if (!preview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPreview(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  return (
    <>
      <div className="staged-row" data-testid="staged-attachments">
        {attachments.map((a, index) => {
          const canPreview = a.kind === "image" && Boolean(projectId);
          const imageUrl = canPreview ? projectRawUrl(projectId!, a.path) : null;
          return (
            <div key={a.path} className={`staged-chip staged-${a.kind}`}>
              <span className="staged-order" aria-label={`Attachment ${index + 1}`}>
                {index + 1}
              </span>
              {canPreview && imageUrl ? (
                <button
                  type="button"
                  className="staged-preview-trigger"
                  onClick={() => setPreview(a)}
                  title={a.path}
                  aria-label={`Preview ${a.name}`}
                >
                  <img src={imageUrl} alt="" aria-hidden />
                  <span className="staged-name">
                    {a.name}
                  </span>
                </button>
              ) : (
                <>
                  <span className="staged-icon" aria-hidden>
                    <Icon name="file" size={13} />
                  </span>
                  <span className="staged-name" title={a.path}>
                    {a.name}
                  </span>
                </>
              )}
              <button
                type="button"
                className="staged-remove od-tooltip"
                onClick={() => onRemove(a.path)}
                title={t('common.delete')}
                data-tooltip={t('common.delete')}
                aria-label={t('chat.removeAria', { name: a.name })}
              >
                <Icon name="close" size={11} />
              </button>
            </div>
          );
        })}
      </div>
      {preview && previewUrl ? createPortal(
        <div
          className="staged-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label={preview.name}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPreview(null);
          }}
        >
          <div className="staged-preview-card">
            <div className="staged-preview-head">
              <span title={preview.path}>{preview.name}</span>
              <button
                type="button"
                className="icon-only od-tooltip"
                onClick={() => setPreview(null)}
                aria-label={t('common.close')}
                title={t('common.close')}
                data-tooltip={t('common.close')}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <img src={previewUrl} alt={preview.name} />
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}

function workspaceContextIcon(item: WorkspaceContextItem): IconName {
  if (item.kind === 'browser') return 'globe';
  if (item.kind === 'folder' || item.kind === 'design-files') return 'folder';
  if (item.kind === 'terminal') return 'terminal';
  if (item.kind === 'side-chat') return 'comment';
  if (item.kind === 'design-system') return 'blocks';
  return 'file';
}

function workspaceContextTitle(item: WorkspaceContextItem): string {
  return [
    workspaceContextKindLabel(item.kind),
    item.path ? `path: ${item.path}` : null,
    item.absolutePath ? `absolute: ${item.absolutePath}` : null,
    item.url ? `url: ${item.url}` : null,
    item.title ? `title: ${item.title}` : null,
  ].filter(Boolean).join(' | ');
}

function workspaceContextDescription(item: WorkspaceContextItem): string {
  return item.url || item.path || item.absolutePath || item.title || item.tabId || item.id;
}

function workspaceContextSearchText(item: WorkspaceContextItem): string {
  return [
    item.id,
    item.kind,
    item.label,
    item.tabId ?? '',
    item.path ?? '',
    item.absolutePath ?? '',
    item.url ?? '',
    item.title ?? '',
  ].join(' ');
}

function workspaceContextKindLabel(kind: WorkspaceContextItem['kind']): string {
  switch (kind) {
    case 'browser':
      return 'Browser';
    case 'design-files':
      return 'Design files';
    case 'design-system':
      return 'Design system';
    case 'folder':
      return 'Folder';
    case 'terminal':
      return 'Terminal';
    case 'side-chat':
      return 'Side chat';
    case 'live-artifact':
      return 'Live artifact';
    case 'file':
    default:
      return 'File';
  }
}

function StagedRunContexts({
  workspaceItems,
  currentWorkspaceContextId,
  skills,
  mcpServers,
  connectors,
  onRemoveWorkspace,
  onRemoveSkill,
  onRemoveMcp,
  onRemoveConnector,
  t,
}: {
  workspaceItems: WorkspaceContextItem[];
  currentWorkspaceContextId: string | null;
  skills: SkillSummary[];
  mcpServers: McpServerConfig[];
  connectors: ConnectorDetail[];
  onRemoveWorkspace: (id: string) => void;
  onRemoveSkill: (id: string) => void;
  onRemoveMcp: (id: string) => void;
  onRemoveConnector: (id: string) => void;
  t: TranslateFn;
}) {
  return (
    <div
      className="staged-row staged-context-row"
      data-testid="staged-contexts"
    >
      {workspaceItems.map((workspaceItem) => {
        const kindLabel =
          workspaceItem.id === currentWorkspaceContextId
            ? 'Current'
            : workspaceContextKindLabel(workspaceItem.kind);
        return (
          <div
            key={workspaceItem.id}
            className={`staged-chip staged-context staged-context--workspace staged-context--workspace-${workspaceItem.kind}`}
          >
            <span className="staged-icon" aria-hidden>
              <Icon name={workspaceContextIcon(workspaceItem)} size={12} />
            </span>
            <span className="staged-name" title={workspaceContextTitle(workspaceItem)}>
              <span className="staged-context-kind">{kindLabel}</span>
              {workspaceItem.label}
            </span>
            <button
              type="button"
              className="staged-remove od-tooltip"
              onClick={() => onRemoveWorkspace(workspaceItem.id)}
              title={t('common.delete')}
              data-tooltip={t('common.delete')}
              aria-label={t('chat.removeAria', { name: workspaceItem.label })}
            >
              <Icon name="close" size={11} />
            </button>
          </div>
        );
      })}
      {skills.map((s) => (
        <div
          key={s.id}
          className={`staged-chip staged-context staged-context--skill staged-skill-${s.source ?? 'built-in'}`}
        >
          <span className="staged-icon" aria-hidden>
            <Icon name="sparkles" size={12} />
          </span>
          <span className="staged-name" title={s.description || s.name}>
            @{s.name}
          </span>
          <button
            type="button"
            className="staged-remove od-tooltip"
            onClick={() => onRemoveSkill(s.id)}
            title={t('common.delete')}
            data-tooltip={t('common.delete')}
            aria-label={t('chat.removeAria', { name: s.name })}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      ))}
      {mcpServers.map((server) => {
        const label = server.label || server.id;
        return (
          <div
            key={server.id}
            className="staged-chip staged-context staged-context--mcp"
          >
            <span className="staged-icon" aria-hidden>
              <Icon name="link" size={12} />
            </span>
            <span className="staged-name" title={server.command || server.url || server.id}>
              @{label}
            </span>
            <button
              type="button"
              className="staged-remove od-tooltip"
              onClick={() => onRemoveMcp(server.id)}
              title={t('common.delete')}
              data-tooltip={t('common.delete')}
              aria-label={t('chat.removeAria', { name: label })}
            >
              <Icon name="close" size={11} />
            </button>
          </div>
        );
      })}
      {connectors.map((connector) => (
        <div
          key={connector.id}
          className="staged-chip staged-context staged-context--connector"
        >
          <span className="staged-icon" aria-hidden>
            <Icon name="link" size={12} />
          </span>
          <span className="staged-name" title={connector.accountLabel ?? connector.provider}>
            @{connector.name}
          </span>
          <button
            type="button"
            className="staged-remove od-tooltip"
            onClick={() => onRemoveConnector(connector.id)}
            title={t('common.delete')}
            data-tooltip={t('common.delete')}
            aria-label={t('chat.removeAria', { name: connector.name })}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

function StagedCommentAttachments({
  attachments,
  onRemove,
  t,
}: {
  attachments: ChatCommentAttachment[];
  onRemove: (id: string) => void;
  t: TranslateFn;
}) {
  const visibleAttachments = attachments.filter((attachment) => attachment.selectionKind !== 'visual');
  if (visibleAttachments.length === 0) return null;
  return (
    <div className="staged-row comment-staged-row" data-testid="staged-comment-attachments">
      {visibleAttachments.map((a) => (
        <div key={a.id} className="staged-chip staged-comment">
          <span
            className="staged-name"
            title={`${a.screenshotPath ? `${a.screenshotPath}: ` : ''}${commentTargetDisplayName(a)}${a.comment ? `: ${a.comment}` : ''}`}
          >
            <strong>{commentTargetDisplayName(a)}</strong>
            {a.comment ? <span>{a.comment}</span> : null}
          </span>
          <button
            type="button"
            className="staged-remove od-tooltip"
            onClick={() => onRemove(a.id)}
            title={t('chat.comments.removeAttachment')}
            data-tooltip={t('chat.comments.removeAttachment')}
            aria-label={t('chat.comments.removeAttachmentAria', { name: a.elementId })}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ToolsPluginsPanel({
  plugins,
  activePluginId,
  onApply,
  onShowDetails,
}: {
  plugins: InstalledPluginRecord[];
  activePluginId: string | null;
  onApply: (record: InstalledPluginRecord) => void | Promise<void>;
  onShowDetails: (record: InstalledPluginRecord) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [source, setSource] = useState<'community' | 'mine'>('community');
  const [query, setQuery] = useState('');
  const communityPlugins = useMemo(
    () => plugins.filter((p) => p.sourceKind === 'bundled'),
    [plugins],
  );
  const userPlugins = useMemo(
    () => plugins.filter((p) => USER_PLUGIN_SOURCE_KINDS.has(p.sourceKind)),
    [plugins],
  );
  const scopedPlugins = source === 'community' ? communityPlugins : userPlugins;
  const visiblePlugins = useMemo(
    () => scopedPlugins.filter((p) => pluginMatchesQuery(p, query)),
    [scopedPlugins, query],
  );

  return (
    <>
      <div className="composer-tools-filter">
        <div className="composer-tools-segments" role="tablist" aria-label="Plugin source">
          <button
            type="button"
            role="tab"
            aria-selected={source === 'community'}
            className={`composer-tools-segment${source === 'community' ? ' active' : ''}`}
            onClick={() => setSource('community')}
            title={`${communityPlugins.length} installed official plugins`}
          >
            Official
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={source === 'mine'}
            className={`composer-tools-segment${source === 'mine' ? ' active' : ''}`}
            onClick={() => setSource('mine')}
            title={`${userPlugins.length} installed user plugins`}
          >
            My plugins
          </button>
        </div>
        <input
          className="composer-tools-search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search plugins…"
          aria-label="Search plugins"
        />
      </div>
      {visiblePlugins.length === 0 ? (
        <div className="composer-tools-empty">
          {plugins.length === 0 ? (
            <>
              No plugins installed yet. Browse Official or add your own with{' '}
              <code>od plugin install &lt;source&gt;</code>.
            </>
          ) : query ? (
            <>No {source === 'community' ? 'Official' : 'My plugins'} results for “{query}”.</>
          ) : (
            <>No {source === 'community' ? 'Official' : 'My plugins'} plugins available.</>
          )}
        </div>
      ) : (
        <div className="composer-tools-list">
          {visiblePlugins.map((p) => (
            <div
              key={p.id}
              className={`composer-tools-row composer-tools-row--plugin${
                p.id === activePluginId ? ' active' : ''
              }`}
            >
              <button
                type="button"
                className="composer-tools-row-main"
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  setPendingId(p.id);
                  try {
                    await onApply(p);
                  } finally {
                    setPendingId(null);
                  }
                }}
                disabled={pendingId !== null}
                aria-busy={pendingId === p.id ? 'true' : undefined}
                title={p.manifest?.description ?? p.title}
              >
                <Icon name="sparkles" size={12} />
                <span className="composer-tools-row-body">
                  <strong>{p.title}</strong>
                  {p.manifest?.description ? (
                    <span className="composer-tools-row-meta">
                      {p.manifest.description}
                    </span>
                  ) : (
                    <span className="composer-tools-row-meta">{p.id}</span>
                  )}
                </span>
                {pendingId === p.id ? (
                  <span className="composer-tools-row-pending">Applying…</span>
                ) : null}
              </button>
              <button
                type="button"
                className="composer-tools-row-side"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onShowDetails(p)}
                title={`View details for ${p.title}`}
                aria-label={`View details for ${p.title}`}
              >
                <Icon name="eye" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ToolsMcpPanel({
  servers,
  templates,
  onInsert,
  onManage,
}: {
  servers: McpServerConfig[];
  templates: McpTemplate[];
  onInsert: (serverId: string) => void;
  onManage: () => void;
}) {
  const [query, setQuery] = useState('');
  const visibleServers = useMemo(
    () => servers.filter((s) => mcpServerMatchesQuery(s, query)),
    [servers, query],
  );
  const visibleTemplates = useMemo(
    () => templates.filter((tpl) => mcpTemplateMatchesQuery(tpl, query)).slice(0, 8),
    [templates, query],
  );

  return (
    <>
      <div className="composer-tools-filter">
        <input
          className="composer-tools-search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search MCP…"
          aria-label="Search MCP servers and templates"
        />
      </div>
      {visibleServers.length === 0 ? (
        <div className="composer-tools-empty">
          {servers.length === 0
            ? 'No enabled MCP servers configured yet.'
            : `No configured MCP results for “${query}”.`}
        </div>
      ) : (
        <div className="composer-tools-list">
          <div className="composer-tools-section-label">Configured</div>
          {visibleServers.map((s) => (
            <button
              key={s.id}
              type="button"
              role="menuitem"
              className="composer-tools-row"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsert(s.id)}
              title={`Insert a hint that nudges the model to use ${s.label || s.id}`}
            >
              <Icon name="link" size={12} />
              <span className="composer-tools-row-body">
                <strong>{s.label || s.id}</strong>
                <span className="composer-tools-row-meta">{s.transport}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {visibleTemplates.length > 0 ? (
        <div className="composer-tools-list">
          <div className="composer-tools-section-label">Templates</div>
          {visibleTemplates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              role="menuitem"
              className="composer-tools-row"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onManage}
              title={`Add ${tpl.label} from Settings`}
            >
              <Icon name="plus" size={12} />
              <span className="composer-tools-row-body">
                <strong>{tpl.label}</strong>
                <span className="composer-tools-row-meta">
                  {tpl.transport}
                  {tpl.category ? ` · ${tpl.category}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="composer-tools-row composer-tools-row-action"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onManage}
      >
        <Icon name="settings" size={12} />
        <span>Manage MCP servers…</span>
      </button>
    </>
  );
}

function DesignToolboxPanel({
  actions,
  skills,
  plugins,
  mcpServers,
  mcpTemplates,
  connectors,
  projectFiles,
  activeSkillIds,
  activePluginId,
  activeMcpServerIds,
  activeConnectorIds,
  activeFilePaths,
  onLucky,
  onPickAction,
  onPickSkill,
  onPickResource,
}: {
  actions: DesignToolboxAction[];
  skills: SkillSummary[];
  plugins: InstalledPluginRecord[];
  mcpServers: McpServerConfig[];
  mcpTemplates: McpTemplate[];
  connectors: ConnectorDetail[];
  projectFiles: ProjectFile[];
  activeSkillIds: string[];
  activePluginId: string | null;
  activeMcpServerIds: string[];
  activeConnectorIds: string[];
  activeFilePaths: string[];
  onLucky: () => void;
  onPickAction: (action: DesignToolboxAction) => void;
  onPickSkill: (skill: SkillSummary) => void;
  onPickResource: (resource: DesignToolboxResource) => void;
}) {
  const { locale } = useI18n();
  const [query, setQuery] = useState('');
  const activeSkillSet = useMemo(() => new Set(activeSkillIds), [activeSkillIds]);
  const activeMcpServerSet = useMemo(() => new Set(activeMcpServerIds), [activeMcpServerIds]);
  const activeConnectorSet = useMemo(() => new Set(activeConnectorIds), [activeConnectorIds]);
  const activeFileSet = useMemo(() => new Set(activeFilePaths), [activeFilePaths]);
  const resources = useMemo(
    () =>
      buildDesignToolboxResources({
        skills,
        plugins,
        mcpServers,
        mcpTemplates,
        connectors,
        projectFiles,
        locale,
      }),
    [connectors, locale, mcpServers, mcpTemplates, plugins, projectFiles, skills],
  );
  const visibleActions = useMemo(
    () =>
      actions.filter((action) =>
        designToolboxActionMatchesQuery(action, query, findDesignToolboxSkill(action, skills)),
      ),
    [actions, query, skills],
  );
  const visibleResources = useMemo(
    () => {
      const source = query
        ? resources.filter((resource) => designToolboxResourceMatchesQuery(resource, query))
        : designToolboxDefaultResources(actions, resources);
      return source.slice(0, query ? 14 : 8);
    },
    [actions, query, resources],
  );

  return (
    <>
      <div className="composer-design-toolbox-head">
        <div className="composer-design-toolbox-title">
          <Icon name="lightbulb" size={14} />
          <span>设计百宝箱</span>
        </div>
        <button
          type="button"
          className="composer-design-toolbox-lucky"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onLucky}
        >
          Feel lucky
        </button>
      </div>
      <div className="composer-tools-filter">
        <input
          className="composer-tools-search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="搜索 skills / MCP / plugins / connectors / design files..."
          aria-label="Search design toolbox resources"
        />
      </div>
      {visibleActions.length > 0 ? (
        <div className="composer-tools-list">
          <div className="composer-tools-section-label">后续动作</div>
          {visibleActions.map((action) => {
            const skill = findDesignToolboxSkill(action, skills);
            return (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                className="composer-tools-row composer-design-toolbox-row"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPickAction(action)}
                title={skill ? localizeSkillDescription(locale, skill) : action.description}
              >
                <span className="composer-design-toolbox-icon" aria-hidden>
                  <Icon name={action.icon} size={13} />
                </span>
                <span className="composer-tools-row-body">
                  <strong>{action.title}</strong>
                  <span className="composer-tools-row-meta">
                    {action.description}
                  </span>
                  {skill ? (
                    <span className="composer-design-toolbox-skill">
                      @{localizeSkillName(locale, skill)}
                    </span>
                  ) : null}
                </span>
                <span className="composer-design-toolbox-badge">{action.badge}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {visibleResources.length > 0 ? (
        <div className="composer-tools-list">
          <div className="composer-tools-section-label">全局资源</div>
          {visibleResources.map((resource) => {
            const active = designToolboxResourceIsActive(resource, {
              skillIds: activeSkillSet,
              pluginId: activePluginId,
              mcpServerIds: activeMcpServerSet,
              connectorIds: activeConnectorSet,
              filePaths: activeFileSet,
            });
            return (
              <button
                key={resource.key}
                type="button"
                role="menuitem"
                className={`composer-tools-row composer-design-toolbox-row${active ? ' active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (resource.kind === 'skill') {
                    onPickSkill(resource.skill);
                  } else {
                    onPickResource(resource);
                  }
                }}
                title={resource.subtitle || resource.title}
              >
                <span className="composer-design-toolbox-icon" aria-hidden>
                  <Icon name={resource.icon} size={13} />
                </span>
                <span className="composer-tools-row-body">
                  <strong>{resource.title}</strong>
                  <span className="composer-tools-row-meta">
                    {resource.subtitle}
                  </span>
                  <span className="composer-design-toolbox-skill">
                    {designToolboxResourceKindLabel(resource.kind)}
                  </span>
                </span>
                <span className="composer-design-toolbox-badge">
                  {active ? '已选' : resource.badge}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      {visibleActions.length === 0 && visibleResources.length === 0 ? (
        <div className="composer-tools-empty">
          No resources found for "{query}".
        </div>
      ) : null}
    </>
  );
}

function ToolsSkillsPanel({
  skills,
  currentSkillId,
  onPick,
}: {
  skills: SkillSummary[];
  currentSkillId: string | null;
  onPick: (skill: SkillSummary) => void | Promise<void>;
}) {
  const { locale } = useI18n();
  const [query, setQuery] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const visibleSkills = useMemo(
    () => skills.filter((s) => skillMatchesQuery(s, query)).slice(0, 24),
    [skills, query],
  );
  return (
    <>
      <div className="composer-tools-filter">
        <input
          className="composer-tools-search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search skills…"
          aria-label="Search skills"
        />
      </div>
      {visibleSkills.length === 0 ? (
        <div className="composer-tools-empty">
          {skills.length === 0 ? 'No skills available yet.' : `No skills found for “${query}”.`}
        </div>
      ) : (
        <div className="composer-tools-list">
          {visibleSkills.map((skill) => {
            const active = skill.id === currentSkillId;
            return (
              <button
                key={skill.id}
                type="button"
                role="menuitem"
                className={`composer-tools-row${active ? ' active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  setPendingId(skill.id);
                  try {
                    await onPick(skill);
                  } finally {
                    setPendingId(null);
                  }
                }}
                disabled={pendingId !== null}
                title={localizeSkillDescription(locale, skill)}
              >
                <Icon name={active ? 'check' : 'file'} size={12} />
                <span className="composer-tools-row-body">
                  <strong>{localizeSkillName(locale, skill)}</strong>
                  <span className="composer-tools-row-meta">
                    {skill.mode}
                    {skill.surface ? ` · ${skill.surface}` : ''}
                  </span>
                </span>
                {pendingId === skill.id ? (
                  <span className="composer-tools-row-pending">Applying…</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function pluginMatchesQuery(plugin: InstalledPluginRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    plugin.title,
    plugin.id,
    plugin.sourceKind,
    plugin.source,
    plugin.manifest?.description ?? '',
    ...(plugin.manifest?.tags ?? []),
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function skillMatchesQuery(skill: SkillSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    skill.id,
    skill.name,
    skill.description,
    skill.mode,
    skill.surface ?? '',
    ...skill.triggers,
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function buildDesignToolboxResources({
  skills,
  plugins,
  mcpServers,
  mcpTemplates,
  connectors,
  projectFiles,
  locale,
}: DesignToolboxResourceIndex & { locale: Locale }): DesignToolboxResource[] {
  const resources: DesignToolboxResource[] = [];

  for (const skill of skills) {
    const title = localizeSkillName(locale, skill);
    const subtitle = localizeSkillDescription(locale, skill);
    resources.push({
      key: `skill:${skill.id}`,
      kind: 'skill',
      id: skill.id,
      title,
      subtitle,
      badge: designToolboxSkillBadge(skill),
      icon: designToolboxSkillIcon(skill),
      searchText: [
        'skill',
        skill.id,
        skill.name,
        title,
        subtitle,
        skill.mode,
        skill.surface ?? '',
        skill.category ?? '',
        ...skill.triggers,
      ].join(' '),
      skill,
    });
  }

  for (const plugin of plugins) {
    const subtitle = plugin.manifest?.description ?? plugin.id;
    resources.push({
      key: `plugin:${plugin.id}`,
      kind: 'plugin',
      id: plugin.id,
      title: plugin.title,
      subtitle,
      badge: plugin.manifest?.od?.kind ?? 'plugin',
      icon: 'sparkles',
      searchText: [
        'plugin',
        plugin.id,
        plugin.title,
        plugin.sourceKind,
        plugin.source,
        subtitle,
        ...(plugin.manifest?.tags ?? []),
        plugin.manifest?.od?.kind ?? '',
        plugin.manifest?.od?.scenario ?? '',
        plugin.manifest?.od?.mode ?? '',
      ].join(' '),
      plugin,
    });
  }

  for (const server of mcpServers) {
    const title = server.label || server.id;
    const subtitle = server.command || server.url || server.transport;
    resources.push({
      key: `mcp:${server.id}`,
      kind: 'mcp',
      id: server.id,
      title,
      subtitle,
      badge: 'MCP',
      icon: 'link',
      searchText: [
        'mcp',
        server.id,
        title,
        subtitle,
        server.transport,
        server.templateId ?? '',
      ].join(' '),
      server,
    });
  }

  for (const template of mcpTemplates) {
    resources.push({
      key: `mcp-template:${template.id}`,
      kind: 'mcp-template',
      id: template.id,
      title: template.label,
      subtitle: template.description,
      badge: template.category,
      icon: 'plus',
      searchText: [
        'mcp template',
        template.id,
        template.label,
        template.description,
        template.transport,
        template.category,
        template.homepage ?? '',
        template.example ?? '',
      ].join(' '),
      template,
    });
  }

  for (const connector of connectors) {
    const toolCount = connector.toolCount ?? connector.tools.length;
    resources.push({
      key: `connector:${connector.id}`,
      kind: 'connector',
      id: connector.id,
      title: connector.name,
      subtitle: [
        connector.description ?? connector.provider,
        toolCount > 0 ? `${toolCount} tools` : null,
        connector.accountLabel ?? null,
      ].filter(Boolean).join(' · '),
      badge: connector.category || 'connector',
      icon: 'link',
      searchText: [
        'connector',
        connector.id,
        connector.name,
        connector.provider,
        connector.category,
        connector.description ?? '',
        connector.accountLabel ?? '',
        ...(connector.featuredToolNames ?? []),
        ...(connector.allowedToolNames ?? []),
        ...connector.tools.slice(0, 20).flatMap((tool) => [tool.name, tool.title, tool.description ?? '']),
      ].join(' '),
      connector,
    });
  }

  const seenFiles = new Set<string>();
  for (const file of projectFiles) {
    if (file.type === 'dir') continue;
    const path = file.path ?? file.name;
    if (!path || seenFiles.has(path)) continue;
    seenFiles.add(path);
    resources.push({
      key: `file:${path}`,
      kind: 'file',
      id: path,
      title: path,
      subtitle: [file.kind, file.mime, file.artifactKind ?? ''].filter(Boolean).join(' · '),
      badge: file.artifactKind ?? file.kind,
      icon: looksLikeImage(path) ? 'image' : 'file',
      searchText: [
        'file',
        'design file',
        path,
        file.name,
        file.kind,
        file.mime,
        file.artifactKind ?? '',
      ].join(' '),
      file,
    });
  }

  return resources;
}

function designToolboxResourceMatchesQuery(
  resource: DesignToolboxResource,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return resource.searchText.toLowerCase().includes(q);
}

function designToolboxDefaultResources(
  actions: DesignToolboxAction[],
  resources: DesignToolboxResource[],
): DesignToolboxResource[] {
  const out: DesignToolboxResource[] = [];
  const seen = new Set<string>();
  function add(resource: DesignToolboxResource | null | undefined) {
    if (!resource || seen.has(resource.key)) return;
    seen.add(resource.key);
    out.push(resource);
  }
  function addByKindId(kind: DesignToolboxResourceKind, id: string) {
    add(resources.find((resource) => resource.kind === kind && resource.id === id));
  }

  addByKindId('skill', 'creative-director');
  for (const action of actions) {
    const skill = resources.find((resource) =>
      resource.kind === 'skill'
      && action.preferredSkillIds.some((id) => resource.skill.id === id || resource.skill.name === id),
    );
    add(skill);
  }
  for (const term of ['design', 'image', 'video', 'motion', 'figma']) {
    for (const resource of resources) {
      if (out.length >= 8) return out;
      if (resource.kind !== 'skill' && designToolboxResourceMatchesQuery(resource, term)) {
        add(resource);
      }
    }
  }
  return out;
}

function designToolboxResourceKindLabel(kind: DesignToolboxResourceKind): string {
  switch (kind) {
    case 'skill':
      return 'Skill';
    case 'plugin':
      return 'Plugin';
    case 'mcp':
      return 'MCP';
    case 'mcp-template':
      return 'MCP template';
    case 'connector':
      return 'Connector';
    case 'file':
      return 'Design file';
  }
}

function designToolboxResourceIsActive(
  resource: DesignToolboxResource,
  active: {
    skillIds: Set<string>;
    pluginId: string | null;
    mcpServerIds: Set<string>;
    connectorIds: Set<string>;
    filePaths: Set<string>;
  },
): boolean {
  switch (resource.kind) {
    case 'skill':
      return active.skillIds.has(resource.skill.id);
    case 'plugin':
      return active.pluginId === resource.plugin.id;
    case 'mcp':
      return active.mcpServerIds.has(resource.server.id);
    case 'connector':
      return active.connectorIds.has(resource.connector.id);
    case 'file':
      return active.filePaths.has(resource.file.path ?? resource.file.name);
    case 'mcp-template':
      return false;
  }
}

function findDesignToolboxSkill(
  action: DesignToolboxAction,
  skills: SkillSummary[],
): SkillSummary | null {
  for (const id of action.preferredSkillIds) {
    const exact = skills.find((skill) => skill.id === id || skill.name === id);
    if (exact) return exact;
  }
  const categoryHintSet = new Set(action.categoryHints);
  const categoryMatch = skills.find((skill) =>
    skill.category ? categoryHintSet.has(skill.category) : false,
  );
  if (categoryMatch) return categoryMatch;
  return (
    skills.find((skill) =>
      action.searchTerms.some((term) => skillMatchesQuery(skill, term)),
    ) ?? null
  );
}

function designToolboxActionMatchesQuery(
  action: DesignToolboxAction,
  query: string,
  skill: SkillSummary | null,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    action.title,
    action.badge,
    action.description,
    ...action.searchTerms,
    skill?.id ?? '',
    skill?.name ?? '',
    skill?.description ?? '',
    skill?.category ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function isDesignToolboxSkill(skill: SkillSummary): boolean {
  const category = skill.category ?? '';
  if (
    [
      'animation-motion',
      'creative-direction',
      'image-generation',
      'video-generation',
      'web-artifacts',
    ].includes(category)
  ) {
    return true;
  }
  return [
    'animation',
    'motion',
    'gsap',
    'polish',
    'critique',
    'taste',
    'anti slop',
    'anti ai',
    'image',
    'video',
    'frontend',
    'beautify',
  ].some((term) => skillMatchesQuery(skill, term));
}

function designToolboxDefaultSkills(
  actions: DesignToolboxAction[],
  skills: SkillSummary[],
): SkillSummary[] {
  const out: SkillSummary[] = [];
  const seen = new Set<string>();
  function add(skill: SkillSummary | null | undefined) {
    if (!skill || seen.has(skill.id)) return;
    seen.add(skill.id);
    out.push(skill);
  }
  for (const action of actions) {
    add(findDesignToolboxSkill(action, skills));
  }
  for (const action of actions) {
    for (const id of action.preferredSkillIds) {
      add(skills.find((skill) => skill.id === id || skill.name === id));
    }
  }
  return out;
}

function designToolboxSkillBadge(skill: SkillSummary): string {
  if (skill.mode === 'video' || skill.category === 'video-generation') return '视频';
  if (skill.mode === 'image' || skill.category === 'image-generation') return '生图';
  if (skill.category === 'animation-motion') return '动画';
  if (skill.category === 'creative-direction') return '润色';
  return skill.mode;
}

function designToolboxSkillIcon(skill: SkillSummary): IconName {
  if (skill.mode === 'video' || skill.category === 'video-generation') return 'play';
  if (skill.mode === 'image' || skill.category === 'image-generation') return 'image';
  if (skill.category === 'animation-motion') return 'sliders';
  if (skill.category === 'creative-direction') return 'sparkles';
  return 'file';
}

function pickLuckyDesignToolboxAction({
  actions,
  draft,
  projectFiles,
  workspaceItem,
}: {
  actions: DesignToolboxAction[];
  draft: string;
  projectFiles: ProjectFile[];
  workspaceItem: WorkspaceContextItem | null;
}): DesignToolboxAction {
  const haystack = [
    draft,
    workspaceItem?.label ?? '',
    workspaceItem?.path ?? '',
    workspaceItem?.title ?? '',
    ...projectFiles.slice(0, 20).map((file) => file.path ?? file.name),
  ]
    .join(' ')
    .toLowerCase();
  const preferredId = keywordPick(
    haystack,
    [
      ['video-gen', ['video', 'sora', 'mp4', 'remotion', 'hyperframes', '视频', '生视频']],
      ['image-gen', ['image', 'png', 'jpg', 'illustration', 'moodboard', '生图', '图片']],
      ['motion', ['animation', 'motion', 'gsap', 'scroll', 'animate', '动效', '动画']],
      ['anti-ai-polish', ['anti', 'slop', 'generic', 'ai味', 'ai 味', '反 ai', '美化']],
      ['visual-polish', ['polish', 'critique', 'audit', 'responsive', '润色', '检查']],
    ],
    haystack.includes('.html') || haystack.includes('browser') ? 'visual-polish' : 'auto-match',
  );
  return actions.find((action) => action.id === preferredId) ?? actions[0]!;
}

function keywordPick(
  haystack: string,
  choices: Array<[DesignToolboxActionId, string[]]>,
  fallback: DesignToolboxActionId,
): DesignToolboxActionId {
  for (const [id, keywords] of choices) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return id;
  }
  return fallback;
}

function designToolboxContextLine(workspaceItem: WorkspaceContextItem | null): string {
  if (!workspaceItem) {
    return '当前目标：当前打开的 HTML / 设计文件 / 网页元素。';
  }
  const label = workspaceItem.label || workspaceItem.path || workspaceItem.title || workspaceItem.id;
  return `当前目标：${workspaceContextKindLabel(workspaceItem.kind)} · ${label}。`;
}

function designToolboxDraftLine(activeDraft: string): string {
  const trimmed = activeDraft.trim();
  if (!trimmed) return '';
  return `保留我输入框里已有的意图：${trimmed}`;
}

function designToolboxActionPrompt({
  action,
  skill,
  workspaceItem,
  activeDraft,
  resourceIndex,
}: {
  action: DesignToolboxAction;
  skill: SkillSummary | null;
  workspaceItem: WorkspaceContextItem | null;
  activeDraft: string;
  resourceIndex: DesignToolboxResourceIndex;
}): string {
  const skillLine = skill
    ? `已选 skill：${skill.name}。请把它作为本轮主要工作流。`
    : '如果没有匹配到具体 skill，请先从当前可用 skills / MCP / plugins / connectors / design files 中选择最合适的组合。';
  const resourceLines = designToolboxResourceIndexLines(resourceIndex);
  const draftLine = designToolboxDraftLine(activeDraft);
  const base = [
    designToolboxContextLine(workspaceItem),
    skillLine,
    ...resourceLines,
    draftLine,
  ].filter(Boolean);

  switch (action.id) {
    case 'auto-match':
      return [
        ...base,
        '请作为 Creative Director 总调度完成一套设计流程：',
        '1. 先帮我定义“什么是好看的设计”：受众、业务目标、品牌气质、风格参考、信息密度、色彩/字体/动效/素材标准，以及不能出现的 AI 味/模板感。',
        '2. 搜索并匹配上面的全量资源索引，不要只看设计百宝箱推荐项；需要时组合 skills、MCP、plugins、connectors 和 design files。',
        '3. 如果目标或审美标准还不够清楚，用有限选项或表单式 UI 引导我选择，并给出推荐默认项；如果已经足够清楚，直接执行下一步。',
        '4. 按“诊断 -> 风格方向 -> 资源选择 -> 具体改动/生成 -> 验证”的顺序走完全程。每一步说明为什么选这些资源，以及下一步需要我确认什么。',
      ].join('\n');
    case 'motion':
      return [
        ...base,
        '请基于当前 HTML / 页面元素加入高质量动效：入场、滚动、状态切换或微交互任选最有效的 1-2 处。保持克制，优先 transform / opacity，并加 prefers-reduced-motion 兜底。',
      ].join('\n');
    case 'motion-polish':
      return [
        ...base,
        '请审查并润色现有动效的节奏、缓动、性能和可访问性。修掉突兀、廉价或影响阅读的动画；必要时改成更细腻的时间线。',
      ].join('\n');
    case 'anti-ai-polish':
      return [
        ...base,
        '请做一次反 AI 味美化：移除模板化布局、廉价渐变/光晕、无意义卡片堆叠和空泛文案；保持信息不丢失，直接改到更像真实设计师交付。',
      ].join('\n');
    case 'visual-polish':
      return [
        ...base,
        '请把这个设计打磨到可交付：检查视觉层级、排版、间距、响应式、按钮状态、空/加载/错误状态和可访问性，并直接完成最重要的修正。',
      ].join('\n');
    case 'image-gen':
      return [
        ...base,
        '请为当前设计生成下一步视觉资产方案：可以是分区参考图、hero 素材、插画、icon、社媒图或 moodboard。先判断最缺哪类图，再给可执行的生成 prompt / 文件计划。',
      ].join('\n');
    case 'video-gen':
      return [
        ...base,
        '请把当前设计转成视频方向：生成短视频分镜、Hyperframes / Remotion 帧结构或 Sora/fal 可用 prompt。优先让现有 HTML / 页面内容自然变成镜头。',
      ].join('\n');
  }
}

function designToolboxSkillPrompt({
  skill,
  workspaceItem,
  activeDraft,
  resourceIndex,
}: {
  skill: SkillSummary;
  workspaceItem: WorkspaceContextItem | null;
  activeDraft: string;
  resourceIndex: DesignToolboxResourceIndex;
}): string {
  return [
    designToolboxContextLine(workspaceItem),
    `使用 ${skill.name} 处理当前设计。`,
    ...designToolboxResourceIndexLines(resourceIndex),
    designToolboxDraftLine(activeDraft),
    '请先判断最合适的加工目标，再直接完成一轮具体改动；如果它依赖外部素材或 API，请给出可运行的替代方案或明确需要我补充什么。',
  ].filter(Boolean).join('\n');
}

function designToolboxResourcePrompt({
  resource,
  workspaceItem,
  activeDraft,
  resourceIndex,
}: {
  resource: Exclude<DesignToolboxResource, { kind: 'skill' }>;
  workspaceItem: WorkspaceContextItem | null;
  activeDraft: string;
  resourceIndex: DesignToolboxResourceIndex;
}): string {
  const base = [
    designToolboxContextLine(workspaceItem),
    `已选资源：${designToolboxResourceKindLabel(resource.kind)} · ${resource.title}（${resource.id}）。`,
    resource.subtitle ? `资源说明：${resource.subtitle}` : '',
    ...designToolboxResourceIndexLines(resourceIndex),
    designToolboxDraftLine(activeDraft),
  ].filter(Boolean);

  switch (resource.kind) {
    case 'plugin':
      return [
        ...base,
        '请把这个 plugin 当作当前设计流程的主要上下文。如果它暴露输入项或 GenUI，请在需要时引导我选择；如果不适合当前目标，请改选更合适的全局资源并说明原因。',
      ].join('\n');
    case 'mcp':
      return [
        ...base,
        '请优先使用这个 MCP 能力完成当前设计下一步。需要外部素材、网页截图、图像/视频生成或数据时，先判断它能否完成，再给出可执行计划。',
      ].join('\n');
    case 'mcp-template':
      return [
        ...base,
        '这个 MCP 是可配置模板。如果它是完成当前设计最需要的工具，请先引导我完成配置；如果已有替代资源可用，请先用替代资源继续。',
      ].join('\n');
    case 'connector':
      return [
        ...base,
        '请在需要真实数据、素材、账号内容或外部工作流时使用这个 connector；使用前先说明会读取/写入什么，必要时让我确认。',
      ].join('\n');
    case 'file':
      return [
        ...base,
        '请把这个 design file 作为当前设计对象或参考资产，基于它完成下一步加工；如果需要同时比较其他文件，请从全量 design files 中继续搜索。',
      ].join('\n');
  }
}

function designToolboxResourceIndexLines(index: DesignToolboxResourceIndex): string[] {
  const files = index.projectFiles
    .filter((file) => file.type !== 'dir')
    .map((file) => file.path ?? file.name);
  return [
    `全局资源索引：skills(${index.skills.length})、plugins(${index.plugins.length})、MCP(${index.mcpServers.length} enabled / ${index.mcpTemplates.length} templates)、connectors(${index.connectors.length} connected)、design files(${files.length})。`,
    designToolboxCompactLine('可搜索 skills', index.skills.map((skill) => skill.name), 60),
    designToolboxCompactLine('可搜索 plugins', index.plugins.map((plugin) => plugin.title), 40),
    designToolboxCompactLine('可用 MCP', [
      ...index.mcpServers.map((server) => server.label || server.id),
      ...index.mcpTemplates.map((template) => `${template.label} template`),
    ], 40),
    designToolboxCompactLine('已连接 connectors', index.connectors.map((connector) => connector.name), 30),
    designToolboxCompactLine('可参考 design files', files, 40),
    '流程规则：先定义审美目标和约束，再搜索/匹配资源；需要用户选择时生成有限选项 UI，引导确认后继续执行。',
  ].filter(Boolean);
}

function designToolboxCompactLine(
  label: string,
  values: string[],
  limit: number,
): string {
  const clean = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  if (clean.length === 0) return '';
  const shown = clean.slice(0, limit);
  const suffix = clean.length > shown.length ? `, +${clean.length - shown.length} more` : '';
  return `${label}：${shown.join(', ')}${suffix}。`;
}

function skillMentionRank(skill: SkillSummary, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const id = skill.id.toLowerCase();
  const name = skill.name.toLowerCase();
  if (id.startsWith(q) || name.startsWith(q)) return 0;
  return 1;
}

function mcpServerMatchesQuery(server: McpServerConfig, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    server.id,
    server.label ?? '',
    server.transport,
    server.url ?? '',
    server.command ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function mcpTemplateMatchesQuery(tpl: McpTemplate, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    tpl.id,
    tpl.label,
    tpl.description,
    tpl.transport,
    tpl.category,
    tpl.homepage ?? '',
    tpl.example ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function pluginSourceLabel(plugin: InstalledPluginRecord, t: TranslateFn): string {
  return plugin.sourceKind === 'bundled' ? t('chat.mentionPluginOfficial') : t('chat.mentionPluginMine');
}

function ToolsImportPanel({
  t,
  onLinkFolder,
  currentDesignSystemId,
  onSwitchDesignSystem,
}: {
  t: TranslateFn;
  onLinkFolder: () => Promise<void> | void;
  currentDesignSystemId?: string | null;
  // When omitted (no active project) the design-system import row stays
  // disabled with the existing "Coming soon" affordance so users aren't
  // routed into a picker that has nothing to PATCH. Returns true on a
  // successful PATCH so the picker can close itself; false leaves the
  // picker open so the user can retry.
  onSwitchDesignSystem?: (
    designSystemId: string | null,
    title: string | null,
  ) => Promise<boolean>;
}) {
  const [view, setView] = useState<'root' | 'designSystems'>('root');

  if (view === 'designSystems' && onSwitchDesignSystem) {
    return (
      <DesignSystemSwitchPicker
        t={t}
        currentDesignSystemId={currentDesignSystemId}
        onSelect={onSwitchDesignSystem}
        onBack={() => setView('root')}
      />
    );
  }

  return (
    <div className="composer-tools-list">
      <ImportItem icon="upload" label={t('chat.importFig')} t={t} />
      <ImportItem icon="grid" label={t('chat.importWeb')} t={t} />
      <ImportItem
        icon="folder"
        label={t('chat.importFolder')}
        t={t}
        enabled
        onClick={() => void onLinkFolder()}
      />
      <ImportItem
        icon="sparkles"
        label={t('chat.importSkills')}
        t={t}
        enabled={!!onSwitchDesignSystem}
        onClick={() => setView('designSystems')}
        testId="composer-import-design-systems"
      />
      <ImportItem icon="file" label={t('chat.importProject')} t={t} />
    </div>
  );
}

function ImportItem({
  icon,
  label,
  t,
  enabled,
  onClick,
  testId,
}: {
  icon: "upload" | "link" | "grid" | "folder" | "sparkles" | "file";
  label: string;
  t: TranslateFn;
  enabled?: boolean;
  onClick?: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={`composer-import-item${enabled ? ' composer-import-item-enabled' : ''}`}
      role="menuitem"
      tabIndex={-1}
      disabled={!enabled}
      title={enabled ? label : t('chat.importComingSoon')}
      onClick={enabled && onClick ? onClick : (e) => e.preventDefault()}
      data-testid={testId}
    >
      <span className="ico" aria-hidden>
        <Icon name={icon} size={14} />
      </span>
      <span className="composer-import-item-label">{label}</span>
      {!enabled && <span className="composer-import-item-soon">{t('chat.importSoon')}</span>}
    </button>
  );
}

function SlashPopover({
  commands,
  activeIndex,
  onPick,
  onHover,
  t,
}: {
  commands: SlashCommand[];
  activeIndex: number;
  onPick: (cmd: SlashCommand) => void;
  onHover: (index: number) => void;
  t: TranslateFn;
}) {
  return (
    <div
      className="slash-popover"
      data-testid="slash-popover"
      role="listbox"
      aria-label={t('pet.slashPopoverAria')}
    >
      <div className="slash-popover-head">
        <span>{t('pet.slashPopoverTitle')}</span>
        <span className="slash-popover-hint">{t('pet.slashPopoverHint')}</span>
      </div>
      {commands.map((cmd, idx) => {
        const active = idx === activeIndex;
        return (
          <button
            key={cmd.id}
            id={`slash-opt-${idx}`}
            type="button"
            role="option"
            aria-selected={active}
            className={`slash-item${active ? ' active' : ''}`}
            onMouseDown={(e) => {
              // Prevent the textarea from losing focus before the click
              // handler fires — otherwise selectionStart resets and the
              // pick replacement targets the wrong substring.
              e.preventDefault();
            }}
            onMouseEnter={() => onHover(idx)}
            onClick={() => onPick(cmd)}
          >
            <span className="slash-item-icon" aria-hidden>
              <Icon name={cmd.icon} size={13} />
            </span>
            <span className="slash-item-body">
              <span className="slash-item-row">
                <code className="slash-item-label">{cmd.label}</code>
                {cmd.argHint ? (
                  <span className="slash-item-arg">{cmd.argHint}</span>
                ) : null}
              </span>
              <span className="slash-item-desc">{t(cmd.descKey)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MentionPopover({
  files,
  workspaceContexts,
  connectors,
  plugins,
  skills,
  mcpServers,
  query,
  tab,
  onTabChange,
  activeIndex,
  currentSkillId,
  onPickFile,
  onPickWorkspaceContext,
  onPickPlugin,
  onPickSkill,
  onPickMcp,
  onPickConnector,
}: {
  files: ProjectFile[];
  workspaceContexts: WorkspaceContextItem[];
  connectors: ConnectorDetail[];
  plugins: InstalledPluginRecord[];
  skills: SkillSummary[];
  mcpServers: McpServerConfig[];
  query: string;
  tab: MentionTab;
  onTabChange: (tab: MentionTab) => void;
  activeIndex: number;
  currentSkillId: string | null;
  onPickFile: (path: string) => void;
  onPickWorkspaceContext: (item: WorkspaceContextItem) => void;
  onPickPlugin: (record: InstalledPluginRecord) => void;
  onPickSkill: (skill: SkillSummary) => void;
  onPickMcp: (server: McpServerConfig) => void;
  onPickConnector: (connector: ConnectorDetail) => void;
}) {
  const { locale, t } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);
  const tabs: Array<{ id: MentionTab; label: string }> = [
    { id: 'all', label: t('chat.mentionTabAll') },
    { id: 'tabs', label: t('chat.mentionTabTabs') },
    { id: 'files', label: t('chat.mentionTabFiles') },
    { id: 'plugins', label: t('chat.mentionTabPlugins') },
    { id: 'skills', label: t('chat.mentionTabSkills') },
    { id: 'mcp', label: t('chat.mentionTabMcp') },
    { id: 'connectors', label: t('chat.mentionTabConnectors') },
  ];
  const showTabs = tab === 'all' || tab === 'tabs';
  const showFiles = tab === 'all' || tab === 'files';
  const showPlugins = tab === 'all' || tab === 'plugins';
  const showSkills = tab === 'all' || tab === 'skills';
  const showMcp = tab === 'all' || tab === 'mcp';
  const showConnectors = tab === 'all' || tab === 'connectors';
  const hasVisibleResults =
    (showTabs && workspaceContexts.length > 0) ||
    (showFiles && files.length > 0) ||
    (showPlugins && plugins.length > 0) ||
    (showSkills && skills.length > 0) ||
    (showMcp && mcpServers.length > 0) ||
    (showConnectors && connectors.length > 0);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [connectors, files, plugins, skills, mcpServers, tab, workspaceContexts]);
  let optionIndex = 0;
  return (
    <div className="mention-popover" data-testid="mention-popover">
      <div className="mention-tabs" role="tablist" aria-label={t('chat.mentionTabsAria')}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`mention-tab${tab === item.id ? ' active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mention-results" ref={ref} role="listbox" id="mention-listbox">
        {!hasVisibleResults ? (
          <div className="mention-empty">
            {query ? (
              <>{t('chat.mentionNoResults', { query })}</>
            ) : (
              <>{t('chat.mentionSearchPrompt')}</>
            )}
          </div>
        ) : null}
        {showTabs && workspaceContexts.length > 0 ? (
          <>
            <div className="mention-section-label">{t('chat.mentionSectionTabs')}</div>
            {workspaceContexts.map((item) => {
              const flat = optionIndex;
              optionIndex += 1;
              const active = flat === activeIndex;
              return (
                <button
                  key={`workspace-${item.kind}-${item.id}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={active}
                  className={`mention-item mention-item--workspace${active ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickWorkspaceContext(item)}
                  title={workspaceContextTitle(item)}
                >
                  <Icon name={workspaceContextIcon(item)} size={12} />
                  <span className="mention-item-body">
                    <strong>{item.label}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {workspaceContextDescription(item)}
                    </span>
                  </span>
                  <span className="mention-meta">{workspaceContextKindLabel(item.kind)}</span>
                </button>
              );
            })}
          </>
        ) : null}
        {showFiles && files.length > 0 ? (
          <>
            <div className="mention-section-label">{t('chat.mentionSectionFiles')}</div>
            {files.map((f) => {
              const key = f.path ?? f.name;
              const flat = optionIndex;
              optionIndex += 1;
              const active = flat === activeIndex;
              return (
                <button
                  key={`file-${key}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={active}
                  className={`mention-item${active ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickFile(key)}
                >
                  <Icon name="file" size={12} />
                  <code>{key}</code>
                  {f.size != null ? (
                    <span className="mention-meta">{prettySize(f.size)}</span>
                  ) : null}
                </button>
              );
            })}
          </>
        ) : null}
        {showPlugins && plugins.length > 0 ? (
          <>
            <div className="mention-section-label">{t('chat.mentionSectionPlugins')}</div>
            {plugins.map((p) => {
              const flat = optionIndex;
              optionIndex += 1;
              const active = flat === activeIndex;
              return (
                <button
                  key={`plugin-${p.id}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={active}
                  className={`mention-item mention-item--plugin${active ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickPlugin(p)}
                  title={p.manifest?.description ?? p.title}
                >
                  <Icon name="sparkles" size={12} />
                  <span className="mention-item-body">
                    <strong>{p.title}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {p.manifest?.description ?? p.id}
                    </span>
                  </span>
                  <span className="mention-meta">{pluginSourceLabel(p, t)}</span>
                </button>
              );
            })}
          </>
        ) : null}
        {showSkills && skills.length > 0 ? (
          <>
            <div className="mention-section-label">{t('chat.mentionSectionSkills')}</div>
            {skills.map((skill) => {
              const flat = optionIndex;
              optionIndex += 1;
              const rowActive = flat === activeIndex;
              const isCurrent = skill.id === currentSkillId;
              return (
                <button
                  key={`skill-${skill.id}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={rowActive}
                  className={`mention-item${rowActive ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickSkill(skill)}
                  title={localizeSkillDescription(locale, skill)}
                >
                  <Icon name={isCurrent ? 'check' : 'file'} size={12} />
                  <span className="mention-item-body">
                    <strong>{localizeSkillName(locale, skill)}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {localizeSkillDescription(locale, skill) || skill.id}
                    </span>
                  </span>
                  <span className="mention-meta">{isCurrent ? t('chat.mentionActiveSkill') : skill.mode}</span>
                </button>
              );
            })}
          </>
        ) : null}
        {showMcp && mcpServers.length > 0 ? (
          <>
            <div className="mention-section-label">{t('chat.mentionSectionMcp')}</div>
            {mcpServers.map((server) => {
              const flat = optionIndex;
              optionIndex += 1;
              const active = flat === activeIndex;
              return (
                <button
                  key={`mcp-${server.id}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={active}
                  className={`mention-item${active ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickMcp(server)}
                  title={t('chat.mentionUseMcpTitle', { name: server.label || server.id })}
                >
                  <Icon name="link" size={12} />
                  <span className="mention-item-body">
                    <strong>{server.label || server.id}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {server.url || server.command || server.id}
                    </span>
                  </span>
                  <span className="mention-meta">{server.transport}</span>
                </button>
              );
            })}
          </>
        ) : null}
        {showConnectors && connectors.length > 0 ? (
          <>
            <div className="mention-section-label">{t('chat.mentionSectionConnectors')}</div>
            {connectors.map((connector) => {
              const flat = optionIndex;
              optionIndex += 1;
              const active = flat === activeIndex;
              return (
                <button
                  key={`connector-${connector.id}`}
                  id={`mention-opt-${flat}`}
                  role="option"
                  aria-selected={active}
                  className={`mention-item${active ? ' is-active' : ''}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickConnector(connector)}
                  title={t('chat.mentionUseConnectorTitle', { name: connector.name })}
                >
                  <Icon name="link" size={12} />
                  <span className="mention-item-body">
                    <strong>{connector.name}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {connector.description || connector.provider || connector.id}
                    </span>
                  </span>
                  <span className="mention-meta">{connector.accountLabel ?? connector.provider}</span>
                </button>
              );
            })}
          </>
        ) : null}
      </div>
    </div>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripInlineMentionToken(text: string, label: string): string {
  const token = inlineMentionToken(label);
  return text.replace(
    new RegExp(`(^|[\\s([{"'])${escapeRegExp(token)}(?=$|\\s|[.,;:!?)}\\]"'])([^\\S\\r\\n])?`, 'g'),
    '$1',
  );
}

function stripInlineMentionLabels(text: string, labels: string[]): string {
  const uniqueLabels = Array.from(new Set(labels.map((label) => label.trim()).filter(Boolean)));
  return uniqueLabels.reduce(
    (current, label) => stripInlineMentionToken(current, label),
    text,
  );
}

function loadComposerDraft(key?: string): string | null {
  if (!key || typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveComposerDraft(key: string | undefined, draft: string) {
  if (!key || typeof window === 'undefined') return;
  try {
    if (draft) {
      window.localStorage.setItem(key, draft);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in privacy modes; the composer should still work.
  }
}

function looksLikeImage(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(name);
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
