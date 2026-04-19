/**
 * Maps free-text hub intent to an Explore capability route (stays inside Explore).
 */
export function routeHubIntentToExplorePath(raw: string): { pathname: string; search: string } {
  const q = raw.trim();
  const enc = q ? `?q=${encodeURIComponent(q)}` : "";
  const lower = q.toLowerCase();

  if (!q) {
    return { pathname: "/app/explore/think/explain", search: "" };
  }

  if (/\b(build|studio|prototype|mvp|website|web app|interface|ui|frontend)\b/.test(lower)) {
    return { pathname: "/app/explore/create/reality", search: enc };
  }
  if (/\b(fix|broken|bug|error|crash|doesn'?t work)\b/.test(lower)) {
    return { pathname: "/app/explore/fix/fix-anything", search: enc };
  }
  if (/\b(image|photo|picture|illustration|render)\b/.test(lower)) {
    return { pathname: "/app/explore/create/image", search: enc };
  }
  if (/\b(video|footage|clip|captions|edit video)\b/.test(lower)) {
    return { pathname: "/app/explore/transform/video-cleaner", search: enc };
  }
  if (/\b(voice|speak|dictat|record audio|transcrib)\b/.test(lower)) {
    return { pathname: "/app/explore/transform/voice-to-text", search: enc };
  }
  if (/\b(plan my day|calendar|schedule|today)\b/.test(lower)) {
    return { pathname: "/app/explore/organize/plan-day", search: enc };
  }
  if (/\b(task|todo|queue|execution)\b/.test(lower)) {
    return { pathname: "/app/explore/organize/tasks", search: enc };
  }
  if (/\b(strategy|roadmap|plan|prioritize)\b/.test(lower)) {
    return { pathname: "/app/explore/think/strategy", search: enc };
  }
  if (/\b(organize|notes|structure|outline)\b/.test(lower)) {
    return { pathname: "/app/explore/organize/pack", search: enc };
  }
  if (/\b(talk|chat|ask malv|operator)\b/.test(lower)) {
    return { pathname: "/app/explore/interact/talk", search: enc };
  }
  if (/\b(resume|cv|curriculum vitae)\b/.test(lower)) {
    return { pathname: "/app/explore/grow/resume", search: enc };
  }
  if (/\b(remember|memory|save this context)\b/.test(lower)) {
    return { pathname: "/app/explore/interact/remember", search: enc };
  }
  if (/\b(goal|okr|objectives)\b/.test(lower)) {
    return { pathname: "/app/explore/organize/goals", search: enc };
  }

  return { pathname: "/app/explore/think/explain", search: enc };
}
