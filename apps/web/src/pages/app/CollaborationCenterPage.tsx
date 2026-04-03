import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  addCollaborationRoomMember,
  createCollaborationRoom,
  createWorkspaceTask,
  enqueueFileUnderstand,
  fetchCollaborationRoom,
  fetchCollaborationRooms,
  fetchConversationOutputs,
  fetchFiles,
  fetchWorkspaceSurface,
  searchDirectoryUsers,
  uploadFileToStorage,
  type CollaborationRoomDetail,
  type CollaborationRoomMember,
  type CollaborationRoomSummary,
  type FileListItem,
  type WorkspaceTask
} from "../../lib/api/dataPlane";
import { ModuleShell } from "./common/ModuleShell";
import { Card, StatusChip } from "@malv/ui";

export function CollaborationCenterPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [rooms, setRooms] = useState<CollaborationRoomSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ room: CollaborationRoomDetail; yourRole: string; members: CollaborationRoomMember[] } | null>(null);
  const [roomFiles, setRoomFiles] = useState<FileListItem[]>([]);
  const [roomOutputs, setRoomOutputs] = useState<Array<{ messageId: string; preview: string }>>([]);
  const [roomTasks, setRoomTasks] = useState<WorkspaceTask[]>([]);
  const [newRoomTaskTitle, setNewRoomTaskTitle] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<Array<{ userId: string; displayName: string }>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingRoomFile, setUploadingRoomFile] = useState(false);

  const inferKind = useCallback((file: File): "pdf" | "image" | "audio" | "video" | "doc" | "text" => {
    const t = file.type;
    if (t === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
    if (t.startsWith("image/")) return "image";
    if (t.startsWith("audio/")) return "audio";
    if (t.startsWith("video/")) return "video";
    if (t.includes("wordprocessing") || /\.docx$/i.test(file.name)) return "doc";
    return "text";
  }, []);

  const loadRooms = useCallback(async () => {
    if (!token) return;
    const r = await fetchCollaborationRooms(token);
    if (!r.ok) throw new Error(r.error ?? "Failed to load rooms.");
    setRooms(r.rooms ?? []);
  }, [token]);

  const loadDetail = useCallback(async (roomId: string) => {
    if (!token) return null;
    const r = await fetchCollaborationRoom(token, roomId);
    if (!r.ok || !r.room) throw new Error(r.error ?? "Failed to load room.");
    const next = { room: r.room, yourRole: r.yourRole ?? "member", members: r.members ?? [] };
    setDetail(next);
    return next;
  }, [token]);

  const loadRoomContext = useCallback(async (roomId: string, conversationId?: string | null) => {
    if (!token) return;
    const [filesRes, outputsRes, surfaceRes] = await Promise.all([
      fetchFiles(token, { limit: 120 }),
      conversationId ? fetchConversationOutputs(token, conversationId, { limit: 16 }) : Promise.resolve(null),
      fetchWorkspaceSurface(token)
    ]);
    setRoomFiles(filesRes.items.filter((f) => f.collaborationRoomId === roomId));
    setRoomOutputs((outputsRes?.outputs ?? []).map((o) => ({ messageId: o.messageId, preview: o.preview })));
    setRoomTasks(surfaceRes.tasks.filter((t) => t.roomId === roomId).slice(0, 12));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void loadRooms().catch((e) => setErr(e instanceof Error ? e.message : "Failed to load."));
  }, [token, loadRooms]);

  useEffect(() => {
    if (!token || !selectedId) {
      setDetail(null);
      setRoomFiles([]);
      setRoomOutputs([]);
      setRoomTasks([]);
      return;
    }
    void (async () => {
      try {
        const next = await loadDetail(selectedId);
        if (next) await loadRoomContext(selectedId, next.room.conversationId);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load room.");
      }
    })();
  }, [token, selectedId, loadDetail, loadRoomContext]);

  async function onSearch() {
    if (!token || searchQ.trim().length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await searchDirectoryUsers(token, searchQ.trim(), { limit: 12 });
      if (!r.ok) throw new Error(r.error ?? "Search failed.");
      setSearchHits(r.users ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateRoom() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await createCollaborationRoom(token, { title: newTitle.trim() || undefined });
      if (!r.ok || !r.room) throw new Error(r.error ?? "Could not create room.");
      setNewTitle("");
      await loadRooms();
      setSelectedId(r.room.roomId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onUploadRoomFile(list: FileList | null) {
    if (!token || !detail?.room.roomId || !detail.room.conversationId || !list?.length) return;
    const f = list[0];
    if (!f) return;
    setUploadingRoomFile(true);
    setErr(null);
    try {
      const reg = await uploadFileToStorage(token, { file: f, fileKind: inferKind(f), roomId: detail.room.roomId });
      if (!reg.ok) throw new Error("Upload failed.");
      const job = await enqueueFileUnderstand(token, reg.fileId, { conversationId: detail.room.conversationId, requiresApproval: false });
      if (!job.ok) throw new Error("Room file processing failed.");
      await loadRoomContext(detail.room.roomId, detail.room.conversationId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Room file upload failed.");
    } finally {
      setUploadingRoomFile(false);
    }
  }

  const activeParticipantIds = useMemo(() => {
    if (!detail) return new Set<string>();
    const ids = new Set<string>([detail.room.ownerUserId]);
    for (const m of detail.members.slice(0, 3)) ids.add(m.userId);
    return ids;
  }, [detail]);

  function openRoomChatWithPrompt(prompt: string) {
    if (!detail?.room.conversationId) return;
    const q = new URLSearchParams();
    q.set("conversationId", detail.room.conversationId);
    q.set("roomId", detail.room.roomId);
    q.set("roomTitle", detail.room.title?.trim() || "Room");
    q.set("roomPrompt", prompt);
    q.set("askRoomPrompt", "1");
    navigate(`/app/chat?${q.toString()}`);
  }

  return (
    <ModuleShell kicker="Phase 4" title="Collaboration" subtitle="Rooms, shared context, and group workflow polish." right={<StatusChip label="Live" status="neutral" />}>
      {err ? (
        <Card variant="glass" className="mb-3 border border-red-500/25 p-4">
          <div className="text-sm text-red-200">{err}</div>
        </Card>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card variant="glass" className="p-4">
          <div className="text-sm font-semibold text-malv-text">Create room</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Title (optional)" className="min-w-[220px] flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm" />
            <button type="button" disabled={!token || busy} onClick={() => void onCreateRoom()} className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-cyan-100/90">Create</button>
          </div>
        </Card>
        <Card variant="glass" className="p-4">
          <div className="text-sm font-semibold text-malv-text">Search users</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="At least 2 characters" className="min-w-[220px] flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm" onKeyDown={(e) => { if (e.key === "Enter") void onSearch(); }} />
            <button type="button" disabled={!token || busy || searchQ.trim().length < 2} onClick={() => void onSearch()} className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-semibold uppercase tracking-wide">Search</button>
          </div>
          {searchHits.length > 0 ? <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm">{searchHits.map((u) => <li key={u.userId} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 px-2 py-1.5"><span className="truncate text-malv-text/90">{u.displayName}</span><button type="button" disabled={!selectedId || busy || detail?.members.some((m) => m.userId === u.userId)} className="shrink-0 rounded-lg border border-cyan-400/25 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-cyan-100/90 disabled:opacity-40" onClick={() => void addCollaborationRoomMember(token!, selectedId!, u.userId).then(() => selectedId ? loadDetail(selectedId) : null)}>Add</button></li>)}</ul> : null}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card variant="glass" className="p-4">
          <div className="text-sm font-semibold text-malv-text">Your rooms</div>
          <ul className="mt-2 space-y-1">
            {rooms.length === 0 ? <li className="text-xs text-malv-text/45">No rooms yet.</li> : null}
            {rooms.map((r) => <li key={r.roomId}><button type="button" onClick={() => setSelectedId(r.roomId)} className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedId === r.roomId ? "border-cyan-400/35 bg-cyan-500/10 text-malv-text" : "border-white/8 bg-white/[0.02] text-malv-text/85"}`}><span className="font-medium">{r.title?.trim() || "Untitled room"}</span><span className="ml-2 text-[10px] font-mono uppercase tracking-wide text-malv-text/45">{r.yourRole}</span></button></li>)}
          </ul>
        </Card>
        <Card variant="glass" className="p-4">
          <div className="text-sm font-semibold text-malv-text">Room detail</div>
          {!selectedId || !detail ? <p className="mt-2 text-xs text-malv-text/45">Select a room to see details.</p> : <div className="mt-2 space-y-3">
            <ul className="space-y-1 text-sm">{detail.members.map((m) => <li key={m.userId} className="flex justify-between gap-2 rounded-lg border border-white/5 px-2 py-1"><span className="truncate">{m.displayName}{activeParticipantIds.has(m.userId) ? <span className="ml-2 rounded-full border border-emerald-300/30 bg-emerald-400/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-emerald-100/90">active</span> : null}</span><span className="shrink-0 text-[10px] font-mono uppercase text-malv-text/45">{m.role}</span></li>)}</ul>
            <div className="flex flex-wrap gap-2">
              {detail.room.conversationId ? <Link to={`/app/chat?conversationId=${encodeURIComponent(detail.room.conversationId)}&roomId=${encodeURIComponent(detail.room.roomId)}&roomTitle=${encodeURIComponent(detail.room.title?.trim() || "Room")}`} className="inline-flex items-center rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-100/90">Room thread</Link> : null}
              <Link to={`/app/voice?scope=group&roomId=${encodeURIComponent(detail.room.roomId)}`} className="inline-flex items-center rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-100/90">Voice</Link>
              <Link to={`/app/video?scope=group&roomId=${encodeURIComponent(detail.room.roomId)}`} className="inline-flex items-center rounded-lg border border-violet-400/25 bg-violet-500/10 px-3 py-1.5 text-[11px] font-medium text-violet-100/90">Video</Link>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-100/90" onClick={() => openRoomChatWithPrompt("Using only this room context, summarize discussion, decisions, and open questions.")}>Summarize discussion</button>
              <button type="button" className="rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide" onClick={() => openRoomChatWithPrompt("Using only this room context, suggest the next 3 concrete actions and who should own each.")}>Suggest actions</button>
            </div>
            <input type="file" disabled={uploadingRoomFile || !detail.room.conversationId} onChange={(e) => void onUploadRoomFile(e.target.files)} className="block w-full text-xs text-malv-text/70 file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/[0.04] file:px-3 file:py-1.5 file:text-[11px]" />
            {roomFiles.length ? <ul className="space-y-1.5">{roomFiles.slice(0, 6).map((f) => <li key={f.id} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[11px]">{f.originalName} ({f.fileKind}) <button type="button" className="ml-2 rounded border border-white/15 px-1.5 py-0.5" onClick={() => void enqueueFileUnderstand(token!, f.id, { conversationId: detail.room.conversationId ?? null, requiresApproval: false })}>Understand</button> <button type="button" className="ml-2 rounded border border-cyan-300/30 bg-cyan-400/10 px-1.5 py-0.5 text-cyan-100/90" onClick={() => openRoomChatWithPrompt(`Using only this room context, analyze shared file ${f.originalName} (${f.fileKind}) and explain impact.`)}>Ask MALV</button></li>)}</ul> : <p className="text-[11px] text-malv-text/45">No room files yet.</p>}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-malv-text/45">Collaboration summaries</div><button type="button" className="rounded border border-cyan-300/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-100/90" onClick={() => openRoomChatWithPrompt("Using only this room thread, produce summary: discussed topics, decisions, tasks, and follow-ups.")}>Generate now</button></div>
              {roomOutputs.length ? <ul className="mt-2 space-y-1">{roomOutputs.slice(0, 5).map((o) => <li key={o.messageId} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-malv-text/75">{o.preview}</li>)}</ul> : <p className="mt-2 text-[11px] text-malv-text/45">No room summaries yet.</p>}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-malv-text/45">Group workflow</div>
              <div className="mt-2 flex gap-2">
                <input value={newRoomTaskTitle} onChange={(e) => setNewRoomTaskTitle(e.target.value)} placeholder="Task for this room..." className="flex-1 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs" />
                <button type="button" disabled={!newRoomTaskTitle.trim() || !token} className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100/90 disabled:opacity-40" onClick={async () => { if (!detail) return; await createWorkspaceTask(token!, { title: newRoomTaskTitle.trim(), source: "manual", status: "todo", roomId: detail.room.roomId, conversationId: detail.room.conversationId ?? null }); setNewRoomTaskTitle(""); await loadRoomContext(detail.room.roomId, detail.room.conversationId); }}>Add</button>
              </div>
              {roomTasks.length ? <ul className="mt-2 space-y-1">{roomTasks.map((t) => <li key={t.id} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-malv-text/80"><span className={t.status === "done" ? "line-through text-malv-text/45" : ""}>{t.title}</span> · {t.status}</li>)}</ul> : <p className="mt-2 text-[11px] text-malv-text/45">No room-linked tasks yet.</p>}
            </div>
          </div>}
        </Card>
      </div>
    </ModuleShell>
  );
}
