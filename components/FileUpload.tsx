"use client";

import { useCallback, useRef, useState } from "react";
import { t } from "../lib/translations";

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  onDemoLoad: () => void;
  isLoading: boolean;
  lang?: string;
}

export default function FileUpload({
  onFileSelected,
  onDemoLoad,
  isLoading,
  lang = "en",
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      setSelectedFile(file);
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (ext === "csv" || ext === "json") {
          handleFile(file);
        }
      }
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      }
    },
    [handleFile]
  );

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full space-y-6">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a CSV or JSON file by dragging it here or clicking to browse"
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`
          relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12
          transition-all duration-500 cursor-pointer group
          ${
            dragActive
              ? "border-cyan-300 bg-cyan-500/10 scale-[0.99]"
              : "border-slate-600/70 bg-slate-900/35 hover:border-cyan-400/55 hover:bg-cyan-500/5"
          }
          ${isLoading ? "pointer-events-none opacity-60" : ""}
        `}
      >
        {/* Decorative background glow */}
        <div className="absolute inset-0 bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl blur-xl" />

        {/* Upload icon */}
        <div className={`mb-4 w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 ${dragActive ? 'bg-cyan-300 text-slate-950 scale-110' : 'bg-slate-800/90 text-slate-400 group-hover:bg-cyan-500/20 group-hover:text-cyan-300 group-hover:rotate-6'}`}>
          <svg
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6h.1a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>

        <p className="text-base font-bold text-slate-100 tracking-tight group-hover:text-cyan-200 transition-colors">
          {t(lang, "dragDrop")}{" "}
          <span className="text-cyan-300 underline decoration-2 underline-offset-4 group-hover:text-cyan-200 transition-colors">{t(lang, "browse")}</span>
        </p>
        <p className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500 group-hover:text-slate-400 transition-colors">
          {t(lang, "csvJsonOnly")}
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,.json"
          onChange={handleChange}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>

      {/* Selected file info */}
      {selectedFile && (
        <div className="flex items-center gap-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 p-5 animate-slide-up">
          <div className="w-12 h-12 rounded-xl bg-cyan-300 flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-500/25">
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-slate-100">
              {selectedFile.name}
            </p>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-0.5">
              {formatSize(selectedFile.size)}
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shadow-lg shadow-emerald-500/10">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest">
              {t(lang, "ready")}
            </span>
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-700/60" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-4 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 rounded-full border border-slate-700/70 bg-slate-900/85">{t(lang, "orDivider")}</span>
        </div>
      </div>

      {/* Demo button */}
      <button
        type="button"
        onClick={onDemoLoad}
        disabled={isLoading}
        className="btn-secondary w-full group overflow-hidden relative"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        <span className="relative z-10 flex items-center justify-center gap-2 uppercase tracking-[0.2em] text-xs font-black">
          {isLoading ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t(lang, "loading")}
            </>
          ) : (
            t(lang, "experienceDemo")
          )}
        </span>
      </button>
    </div>
  );
}
