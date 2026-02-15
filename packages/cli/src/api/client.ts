import { generateInternalToken } from "@open-inspect/shared";
import type { AgentEvent, SessionArtifact } from "@open-inspect/shared";

/**
 * Raw response from GET /sessions/:id.
 * The sandbox status is nested under `sandbox.status`.
 */
export interface SessionStateRaw {
  id: string;
  title: string | null;
  repoOwner: string;
  repoName: string;
  branchName: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
  sandbox: {
    id: string | null;
    modalSandboxId: string | null;
    status: string;
    gitSyncStatus: string;
    lastHeartbeat: number | null;
  } | null;
}

/**
 * Normalized session state for easier consumption by the CLI.
 */
export interface SessionState {
  id: string;
  title: string | null;
  repoOwner: string;
  repoName: string;
  branchName: string | null;
  status: string;
  sandboxStatus: string;
  isProcessing: boolean;
  createdAt: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ControlPlaneClient {
  private readonly baseUrl: string;
  private readonly secret: string;

  constructor(opts: { controlPlaneUrl: string; secret: string }) {
    this.baseUrl = opts.controlPlaneUrl.replace(/\/+$/, "");
    this.secret = opts.secret;
  }

  private async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const token = await generateInternalToken(this.secret);
    const url = `${this.baseUrl}${path}`;
    const res = await globalThis.fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new ApiError(
        `API ${options.method ?? "GET"} ${path} failed (${res.status})`,
        res.status,
        body
      );
    }
    return res;
  }

  async createSession(params: {
    repoOwner: string;
    repoName: string;
    title?: string;
    model?: string;
    githubName?: string;
    githubEmail?: string;
  }): Promise<{ sessionId: string }> {
    const res = await this.fetch("/sessions", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return res.json() as Promise<{ sessionId: string }>;
  }

  async getSession(sessionId: string): Promise<SessionState> {
    const res = await this.fetch(`/sessions/${sessionId}`);
    const raw = (await res.json()) as SessionStateRaw;

    // Normalize the nested sandbox structure into flat fields
    return {
      id: raw.id,
      title: raw.title,
      repoOwner: raw.repoOwner,
      repoName: raw.repoName,
      branchName: raw.branchName,
      status: raw.status,
      sandboxStatus: raw.sandbox?.status ?? "pending",
      // The sandbox goes to "ready" (not "running") when idle between prompts.
      // Treat both "running" and "ready" as potentially-processing states.
      // True completion is detected via execution_complete events or sandbox "stopped".
      isProcessing: raw.sandbox?.status === "running" || raw.sandbox?.status === "ready",
      createdAt: raw.createdAt,
    };
  }

  async sendPrompt(
    sessionId: string,
    content: string,
    options?: { model?: string; source?: string }
  ): Promise<void> {
    await this.fetch(`/sessions/${sessionId}/prompt`, {
      method: "POST",
      body: JSON.stringify({
        content,
        source: options?.source ?? "cli",
        ...(options?.model && { model: options.model }),
      }),
    });
  }

  async stopSession(sessionId: string): Promise<void> {
    await this.fetch(`/sessions/${sessionId}/stop`, { method: "POST" });
  }

  /**
   * Fetch events for a session.
   *
   * The control plane's events API returns events in reverse chronological order
   * with cursor semantics meaning "get events older than cursor". For CLI polling
   * we always fetch the most recent events (no cursor) and deduplicate client-side.
   */
  async getEvents(
    sessionId: string,
    options?: { limit?: number }
  ): Promise<{ events: AgentEvent[] }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    const query = params.toString() ? `?${params}` : "";
    const res = await this.fetch(`/sessions/${sessionId}/events${query}`);
    return res.json() as Promise<{ events: AgentEvent[] }>;
  }

  async getArtifacts(sessionId: string): Promise<{ artifacts: SessionArtifact[] }> {
    const res = await this.fetch(`/sessions/${sessionId}/artifacts`);
    return res.json() as Promise<{ artifacts: SessionArtifact[] }>;
  }
}
