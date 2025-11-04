"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UploadLocation = "backlog" | "ready" | "published";
type TaskStatus = "todo" | "in-progress" | "done";

interface VideoTask {
  id: string;
  title: string;
  status: TaskStatus;
  owner?: string;
  dueDate?: string;
  notes?: string;
}

interface VideoAsset {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: number;
  objectUrl: string;
  duration?: number;
  width?: number;
  height?: number;
  tags: string[];
  status: UploadLocation;
  notes: string;
  tasks: VideoTask[];
  generatedInsights: string[];
}

interface AgentLog {
  id: string;
  timestamp: number;
  message: string;
  variant: "info" | "success" | "warning";
}

const sizeFormatter = new Intl.NumberFormat(undefined, {
  style: "unit",
  unit: "megabyte",
  unitDisplay: "narrow",
  maximumFractionDigits: 1,
});

const statusLabels: Record<UploadLocation, string> = {
  backlog: "Backlog",
  ready: "Ready to Edit",
  published: "Published",
};

const taskColors: Record<TaskStatus, string> = {
  todo: "bg-lime-500/10 text-lime-400 border border-lime-500/30",
  "in-progress": "bg-sky-500/10 text-sky-300 border border-sky-500/30",
  done: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30",
};

export default function Home() {
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [agentLog, setAgentLog] = useState<AgentLog[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedVideo = useMemo(
    () => videos.find((video) => video.id === selectedId) ?? null,
    [videos, selectedId],
  );

  const pushLog = useCallback((entry: Omit<AgentLog, "id">) => {
    setAgentLog((logs) => [
      {
        id: crypto.randomUUID(),
        ...entry,
      },
      ...logs.slice(0, 49),
    ]);
  }, []);

  const computeInsights = useCallback((assets: VideoAsset[]) => {
    if (!assets.length) return ["Upload your first video to get tailored plans."];
    const totalSize = assets.reduce((acc, item) => acc + item.fileSize, 0);
    const totalDurationSeconds = assets.reduce(
      (acc, item) => acc + (item.duration ?? 0),
      0,
    );
    const backlog = assets.filter((asset) => asset.status === "backlog").length;
    const ready = assets.filter((asset) => asset.status === "ready").length;
    const published = assets.filter(
      (asset) => asset.status === "published",
    ).length;

    const info: string[] = [
      `Inventory: ${assets.length} videos • ${sizeFormatter.format(totalSize / 1_000_000)} total`,
      backlog
        ? `${backlog} in backlog — assign priority owners.`
        : "Backlog clear — maintain capture cadence.",
      ready && !published
        ? `${ready} prepped for editing — book an assembly session.`
        : "",
      published
        ? `${published} published assets — consider highlight compilations.`
        : "",
    ].filter(Boolean);

    if (totalDurationSeconds) {
      const hours = Math.floor(totalDurationSeconds / 3600);
      const minutes = Math.floor((totalDurationSeconds % 3600) / 60);
      const seconds = Math.floor(totalDurationSeconds % 60);
      info.push(
        `Runtime coverage ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.`,
      );
    }

    return info;
  }, []);

  const handleFiles = useCallback(
    async (incoming: FileList | File[]) => {
      const fileArray = Array.from(incoming);
      const filtered = fileArray.filter((file) => file.type.startsWith("video/"));

      if (!filtered.length) {
        pushLog({
          timestamp: Date.now(),
          message: "Only video files are supported right now.",
          variant: "warning",
        });
        return;
      }

      const assets: VideoAsset[] = filtered.map((file) => {
        const id = crypto.randomUUID();
        return {
          id,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          createdAt: Date.now(),
          objectUrl: URL.createObjectURL(file),
          tags: [],
          status: "backlog",
          notes: "",
          tasks: [],
          generatedInsights: [],
        };
      });

      setVideos((prev) => [...assets, ...prev]);
      pushLog({
        timestamp: Date.now(),
        message: `Ingested ${assets.length} video${assets.length > 1 ? "s" : ""}.`,
        variant: "success",
      });
      setSelectedId(assets[0]?.id ?? null);
    },
    [pushLog],
  );

  const loadMetadata = useCallback((asset: VideoAsset) => {
    const videoElement = document.createElement("video");
    videoElement.preload = "metadata";
    videoElement.src = asset.objectUrl;
    videoElement.onloadedmetadata = () => {
      setVideos((state) =>
        state.map((item) =>
          item.id === asset.id
            ? {
                ...item,
                duration: videoElement.duration,
                width: videoElement.videoWidth,
                height: videoElement.videoHeight,
                generatedInsights: [
                  `Resolution ${videoElement.videoWidth}×${videoElement.videoHeight}`,
                  `Duration ${(videoElement.duration / 60).toFixed(1)} minutes`,
                ],
              }
            : item,
        ),
      );
      videoElement.src = "";
    };
  }, []);

  useEffect(() => {
    videos.forEach((asset) => {
      if (asset.duration === undefined) {
        loadMetadata(asset);
      }
    });
  }, [videos, loadMetadata]);

  const removeVideo = useCallback(
    (id: string) => {
      setVideos((state) => {
        const target = state.find((video) => video.id === id);
        if (target) {
          URL.revokeObjectURL(target.objectUrl);
        }
        return state.filter((video) => video.id !== id);
      });
      setAgentLog((log) => [
        {
          id: crypto.randomUUID(),
          message: "Removed video from library.",
          timestamp: Date.now(),
          variant: "info",
        },
        ...log,
      ]);
      if (selectedId === id) {
        setSelectedId(null);
      }
    },
    [selectedId],
  );

  const updateVideo = useCallback(
    (id: string, updater: (current: VideoAsset) => VideoAsset) => {
      setVideos((state) =>
        state.map((video) => (video.id === id ? updater(video) : video)),
      );
    },
    [],
  );

  const addTag = useCallback(
    (id: string, tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed) return;
      updateVideo(id, (video) => ({
        ...video,
        tags: Array.from(new Set([...video.tags, trimmed])),
      }));
    },
    [updateVideo],
  );

  const removeTag = useCallback(
    (id: string, value: string) => {
      updateVideo(id, (video) => ({
        ...video,
        tags: video.tags.filter((tag) => tag !== value),
      }));
    },
    [updateVideo],
  );

  const addTask = useCallback(
    (id: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      updateVideo(id, (video) => ({
        ...video,
        tasks: [
          ...video.tasks,
          {
            id: crypto.randomUUID(),
            title: trimmed,
            status: "todo",
          },
        ],
      }));
    },
    [updateVideo],
  );

  const setTaskStatus = useCallback(
    (videoId: string, taskId: string, status: TaskStatus) => {
      updateVideo(videoId, (video) => ({
        ...video,
        tasks: video.tasks.map((task) =>
          task.id === taskId ? { ...task, status } : task,
        ),
      }));
    },
    [updateVideo],
  );

  const removeTask = useCallback(
    (videoId: string, taskId: string) => {
      updateVideo(videoId, (video) => ({
        ...video,
        tasks: video.tasks.filter((task) => task.id !== taskId),
      }));
    },
    [updateVideo],
  );

  const insights = useMemo(() => computeInsights(videos), [videos, computeInsights]);

  const handleBulkAssignment = useCallback(
    (status: UploadLocation) => {
      const updated = videos.filter(
        (video) =>
          video.status !== status && (status !== "published" || video.tasks.length),
      ).length;
      setVideos((state) =>
        state.map((video) =>
          video.tasks.length || status !== "published"
            ? { ...video, status }
            : video,
        ),
      );
      pushLog({
        timestamp: Date.now(),
        message:
          updated > 0
            ? `Agent queued ${updated} video${updated > 1 ? "s" : ""} for ${statusLabels[status].toLowerCase()}.`
            : "Nothing to update — add tasks before publishing.",
        variant: updated > 0 ? "success" : "warning",
      });
    },
    [videos, pushLog],
  );

  useEffect(() => {
    if (!selectedId && videos.length) {
      setSelectedId(videos[0].id);
    }
  }, [videos, selectedId]);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer.files?.length) {
        void handleFiles(event.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const onPickFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const list = event.target.files;
      if (list?.length) {
        void handleFiles(list);
      }
      event.target.value = "";
    },
    [handleFiles],
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 lg:px-8">
        <header className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-sky-400">
            Video Ops Agent
          </p>
          <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl">
            Manage every uploaded video with an autonomous control center.
          </h1>
          <p className="text-sm text-slate-300 sm:text-base">
            Drop raw footage, tag priorities, assign workflows, and let the in-app agent drive the next steps.
          </p>
        </header>

        <section
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={onDrop}
          className="flex flex-col gap-4 rounded-2xl border border-sky-500/30 bg-slate-900/70 p-6 shadow-lg shadow-sky-500/10 transition duration-200 hover:border-sky-400/50"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Ingest videos</h2>
              <p className="text-sm text-slate-300">
                Drop files anywhere, or use the picker. Videos stay local to your browser.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={onPickFiles}
                className="rounded-lg border border-sky-500/40 bg-sky-600/20 px-4 py-2 text-sm font-medium text-sky-200 transition hover:bg-sky-500/30"
              >
                Select files
              </button>
              <button
                onClick={() => handleBulkAssignment("ready")}
                className="rounded-lg border border-lime-500/30 bg-lime-500/10 px-4 py-2 text-sm font-medium text-lime-200 transition hover:bg-lime-500/20"
              >
                Queue for edit
              </button>
              <button
                onClick={() => handleBulkAssignment("published")}
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20"
              >
                Mark published
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-dashed border-slate-500/40 bg-slate-900/60 p-6 text-center text-sm text-slate-300">
            Drag &amp; drop to add videos. The agent extracts duration and resolution automatically.
          </div>
          <input
            ref={fileInputRef}
            onChange={onFileInput}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
          <section className="flex min-h-[520px] flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
            <header className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Library</h2>
                <p className="text-xs text-slate-400">
                  {videos.length} video{videos.length === 1 ? "" : "s"} tracked
                </p>
              </div>
              <div className="flex gap-2 text-[10px] font-medium uppercase tracking-[0.3em] text-slate-400">
                <span>Backlog</span>
                <span>Ready</span>
                <span>Published</span>
              </div>
            </header>
            <div className="scrollbar-thin flex-1 overflow-y-auto rounded-xl bg-slate-950/60 p-2">
              {videos.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-slate-800/80 bg-slate-900/80 p-8 text-center text-sm text-slate-400">
                  <p>No videos yet.</p>
                  <p>Upload files to activate the workflow agent.</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {videos.map((video) => (
                    <li key={video.id}>
                      <button
                        onClick={() => setSelectedId(video.id)}
                        className={`flex w-full flex-col gap-1 rounded-xl border px-4 py-3 text-left transition ${
                          selectedId === video.id
                            ? "border-sky-500/60 bg-sky-500/10"
                            : "border-slate-800 bg-slate-900/80 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-start justify-between text-sm text-white">
                          <p className="truncate font-medium">{video.fileName}</p>
                          <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">
                            {statusLabels[video.status]}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span>{sizeFormatter.format(video.fileSize / 1_000_000)}</span>
                          {video.duration !== undefined && (
                            <span>• {Math.round(video.duration)}s</span>
                          )}
                          {video.tags.length > 0 && (
                            <span>
                              • {video.tags.slice(0, 2).join(", ")}
                              {video.tags.length > 2 ? " +" : ""}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="flex min-h-[520px] flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
            <header className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Asset workspace</h2>
                <p className="text-sm text-slate-300">
                  Inspect, annotate, and stage publishing decisions.
                </p>
              </div>
              {selectedVideo && (
                <button
                  onClick={() => removeVideo(selectedVideo.id)}
                  className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20"
                >
                  Remove
                </button>
              )}
            </header>
            {selectedVideo ? (
              <div className="flex flex-col gap-6">
                <article className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  {selectedVideo.objectUrl ? (
                    <video
                      key={selectedVideo.id}
                      src={selectedVideo.objectUrl}
                      controls
                      className="aspect-video w-full rounded-lg border border-slate-800/60 bg-black"
                    />
                  ) : (
                    <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-slate-800/60 bg-slate-900/80 text-center text-sm text-slate-400">
                      Video data missing. Re-upload to reconnect.
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span>{selectedVideo.fileType}</span>
                    <span>• {sizeFormatter.format(selectedVideo.fileSize / 1_000_000)}</span>
                    {selectedVideo.duration !== undefined && (
                      <span>• runtime {Math.round(selectedVideo.duration)}s</span>
                    )}
                    {selectedVideo.width && selectedVideo.height && (
                      <span>
                        • {selectedVideo.width}×{selectedVideo.height}px
                      </span>
                    )}
                    <span>
                      • uploaded{" "}
                      {new Date(selectedVideo.createdAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                </article>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <h3 className="text-sm font-semibold text-white">Tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedVideo.tags.map((tag) => (
                        <span
                          key={tag}
                          className="group flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-200"
                        >
                          {tag}
                          <button
                            className="text-sky-300/60 transition group-hover:text-sky-100"
                            onClick={() => removeTag(selectedVideo.id, tag)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <TagCreator
                        onSubmit={(value) => addTag(selectedVideo.id, value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">Status</h3>
                      <select
                        value={selectedVideo.status}
                        onChange={(event) =>
                          updateVideo(selectedVideo.id, (video) => ({
                            ...video,
                            status: event.target.value as UploadLocation,
                          }))
                        }
                        className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1 text-xs text-slate-200"
                      >
                        {Object.entries(statusLabels).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedVideo.generatedInsights.map((insight) => (
                        <span
                          key={insight}
                          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300"
                        >
                          {insight}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <header className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">Tasks</h3>
                      <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                        Agent curated
                      </span>
                    </header>
                    {selectedVideo.tasks.length === 0 ? (
                      <p className="text-sm text-slate-400">
                        No tasks yet. Use prompts or add custom actions.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {selectedVideo.tasks.map((task) => (
                          <li
                            key={task.id}
                            className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs ${taskColors[task.status]}`}
                          >
                            <div className="flex flex-1 flex-col">
                              <span className="font-medium">{task.title}</span>
                              <div className="flex gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                                <button
                                  onClick={() => setTaskStatus(selectedVideo.id, task.id, "todo")}
                                  className={`transition ${
                                    task.status === "todo" ? "text-white" : ""
                                  }`}
                                >
                                  Todo
                                </button>
                                <button
                                  onClick={() =>
                                    setTaskStatus(selectedVideo.id, task.id, "in-progress")
                                  }
                                  className={`transition ${
                                    task.status === "in-progress" ? "text-white" : ""
                                  }`}
                                >
                                  Active
                                </button>
                                <button
                                  onClick={() => setTaskStatus(selectedVideo.id, task.id, "done")}
                                  className={`transition ${
                                    task.status === "done" ? "text-white" : ""
                                  }`}
                                >
                                  Done
                                </button>
                              </div>
                            </div>
                            <button
                              onClick={() => removeTask(selectedVideo.id, task.id)}
                              className="text-[11px] uppercase tracking-[0.35em] text-slate-300/60 transition hover:text-slate-100"
                            >
                              Clear
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <TaskCreator onSubmit={(value) => addTask(selectedVideo.id, value)} />
                  </div>

                  <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <h3 className="text-sm font-semibold text-white">Notes</h3>
                    <textarea
                      value={selectedVideo.notes}
                      onChange={(event) =>
                        updateVideo(selectedVideo.id, (video) => ({
                          ...video,
                          notes: event.target.value,
                        }))
                      }
                      className="min-h-[180px] resize-none rounded-lg border border-slate-800 bg-slate-900/80 p-3 text-sm text-slate-200 outline-none focus:border-sky-500/60"
                      placeholder="Production notes, timestamps, ownership details..."
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-600/50 bg-slate-950/50">
                <p className="max-w-sm text-center text-sm text-slate-400">
                  Select a video to start managing metadata, tasks, and publishing intent.
                </p>
              </div>
            )}
          </section>

          <section className="flex min-h-[520px] flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
            <header className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Agent cockpit</h2>
                <p className="text-sm text-slate-300">
                  Automated situational awareness and playbooks.
                </p>
              </div>
              <div className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.3em] text-sky-200">
                Online
              </div>
            </header>

            <article className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <h3 className="text-sm font-semibold text-white">Library insights</h3>
              <ul className="flex flex-col gap-2 text-sm text-slate-300">
                {insights.map((line, index) => (
                  <li
                    key={`${line}-${index}`}
                    className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </article>

            <article className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Suggested actions</h3>
                <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                  Agent routines
                </span>
              </div>
              <div className="grid gap-2">
                <button
                  onClick={() =>
                    selectedVideo
                      ? addTask(selectedVideo.id, "Extract highlight reel timestamps")
                      : pushLog({
                          timestamp: Date.now(),
                          message: "Select a video to queue highlight extraction.",
                          variant: "warning",
                        })
                  }
                  className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-left text-sm text-sky-100 transition hover:bg-sky-500/20"
                >
                  Flag highlight reel for current asset
                </button>
                <button
                  onClick={() =>
                    selectedVideo
                      ? addTask(selectedVideo.id, "Draft social captions & thumbnails")
                      : pushLog({
                          timestamp: Date.now(),
                          message: "Choose a video to generate social packaging tasks.",
                          variant: "warning",
                        })
                  }
                  className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-left text-sm text-purple-100 transition hover:bg-purple-500/20"
                >
                  Spin up social distribution checklist
                </button>
                <button
                  onClick={() => handleBulkAssignment("ready")}
                  className="rounded-lg border border-lime-500/30 bg-lime-500/10 px-3 py-2 text-left text-sm text-lime-100 transition hover:bg-lime-500/20"
                >
                  Move backlog videos into editing queue
                </button>
                <button
                  onClick={() => handleBulkAssignment("published")}
                  className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-left text-sm text-emerald-100 transition hover:bg-emerald-500/20"
                >
                  Close tasks &amp; mark ready assets as published
                </button>
              </div>
            </article>

            <article className="flex flex-1 flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <h3 className="text-sm font-semibold text-white">Agent feed</h3>
              <div className="scrollbar-thin flex-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-300">
                {agentLog.length === 0 ? (
                  <p>Agent idle. Upload a video or trigger an automation.</p>
                ) : (
                  <ul className="flex flex-col-reverse gap-3">
                    {agentLog.map((log) => (
                      <li
                        key={log.id}
                        className={`rounded-lg border px-3 py-2 ${
                          log.variant === "success"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                            : log.variant === "warning"
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                              : "border-slate-700 bg-slate-800/70 text-slate-200"
                        }`}
                      >
                        <p className="font-medium">
                          {new Date(log.timestamp).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </p>
                        <p>{log.message}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          </section>
        </div>
      </div>
    </main>
  );
}

function TagCreator({ onSubmit }: { onSubmit: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!value.trim()) return;
        onSubmit(value.trim());
        setValue("");
      }}
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Add tag"
        className="w-28 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:border-sky-500/50 focus:outline-none"
      />
      <button
        type="submit"
        className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-200 transition hover:border-sky-500/50 hover:text-sky-100"
      >
        Add
      </button>
    </form>
  );
}

function TaskCreator({ onSubmit }: { onSubmit: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!value.trim()) return;
        onSubmit(value.trim());
        setValue("");
      }}
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Add task"
        className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-sky-500/50 focus:outline-none"
      />
      <button
        type="submit"
        className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-500/50 hover:text-sky-100"
      >
        Queue
      </button>
    </form>
  );
}
