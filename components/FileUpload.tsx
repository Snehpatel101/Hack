"use client";

import { useCallback, useRef, useState } from "react";

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  onDemoLoad: () => void;
  isLoading: boolean;
}

export default function FileUpload({
  onFileSelected,
  onDemoLoad,
  isLoading,
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
    <div className="w-full space-y-4">
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
          relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8
          transition-all duration-300 cursor-pointer
          ${
            dragActive
              ? "border-orange-500 bg-orange-500/10"
              : "border-gray-600 bg-card-hover hover:border-orange-400 hover:bg-orange-500/5"
          }
          ${isLoading ? "pointer-events-none opacity-60" : ""}
        `}
      >
        {/* Upload icon */}
        <svg
          className="mb-3 h-10 w-10 text-gray-500"
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

        <p className="text-sm font-medium text-gray-300">
          Drag and drop your file here, or{" "}
          <span className="text-orange-400 underline">browse</span>
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Supports CSV and JSON files
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
        <div className="flex items-center gap-3 rounded-lg bg-orange-500/10 border border-orange-500/20 px-4 py-3 animate-slide-up">
          <svg
            className="h-5 w-5 flex-shrink-0 text-orange-400"
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
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-100">
              {selectedFile.name}
            </p>
            <p className="text-xs text-gray-500">
              {formatSize(selectedFile.size)}
            </p>
          </div>
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
            Ready
          </span>
        </div>
      )}

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-700/50" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-card px-3 text-gray-500">or</span>
        </div>
      </div>

      {/* Demo button */}
      <button
        type="button"
        onClick={onDemoLoad}
        disabled={isLoading}
        className={`
          w-full rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3
          text-sm font-medium text-orange-400
          transition-all duration-300
          hover:bg-orange-500/20 hover:border-orange-500/50
          focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-[#0a0a0a]
          disabled:cursor-not-allowed disabled:opacity-50
        `}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Loading...
          </span>
        ) : (
          "Try Demo Data"
        )}
      </button>
    </div>
  );
}
