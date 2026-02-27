"use client";

import { useState, useCallback } from "react";
import Logo from "../components/Logo";
import FileUpload from "../components/FileUpload";
import ProfileForm from "../components/ProfileForm";
import SnapshotView from "../components/SnapshotView";
import PlanView from "../components/PlanView";
import WorkflowTrace from "../components/WorkflowTrace";
import QUBOVisualization from "../components/QUBOVisualization";
import RiskAlert from "../components/RiskAlert";
import ChatBot from "../components/ChatBot";
import type { CopilotResponse } from "../lib/types";

type Stage = "upload" | "profile" | "loading" | "results";

export default function Home() {
  const [stage, setStage] = useState<Stage>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [result, setResult] = useState<CopilotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState("");

  const handleFileSelected = useCallback((f: File) => {
    setFile(f);
    setError(null);
    setStage("profile");
  }, []);

  const handleDemoLoad = useCallback(() => {
    setIsDemoMode(true);
    setError(null);
    setStage("profile");
  }, []);

  const handleProfileSubmit = useCallback(
    async (profile: { checking_balance: number; goal: string }) => {
      setStage("loading");
      setError(null);
      setLoadingStep("Uploading and parsing your data...");

      try {
        const formData = new FormData();

        if (isDemoMode) {
          setLoadingStep("Loading demo data...");
          const csvRes = await fetch("/demo/demo_transactions.csv");
          const csvText = await csvRes.text();
          const csvBlob = new Blob([csvText], { type: "text/csv" });
          formData.append("file", csvBlob, "demo_transactions.csv");

          const profileRes = await fetch("/demo/demo_profile.json");
          const demoProfile = await profileRes.json();
          formData.append(
            "profile",
            JSON.stringify({
              ...demoProfile,
              checking_balance:
                profile.checking_balance || demoProfile.checking_balance,
              goal: profile.goal || demoProfile.goal,
            })
          );
        } else if (file) {
          formData.append("file", file);
          formData.append("profile", JSON.stringify(profile));
        } else {
          throw new Error("No file selected.");
        }

        setLoadingStep("AI agent is analyzing your finances...");

        const res = await fetch("/api/pipeline", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(
            errData.error || `Server error: ${res.status}`
          );
        }

        const data: CopilotResponse = await res.json();
        setResult(data);
        setStage("results");
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.";
        setError(message);
        setStage("upload");
      }
    },
    [file, isDemoMode]
  );

  const handleReset = useCallback(() => {
    setStage("upload");
    setFile(null);
    setIsDemoMode(false);
    setResult(null);
    setError(null);
  }, []);

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-900 via-[#1a1207] to-gray-900 border-b border-orange-500/20">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <Logo size="lg" />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
        {/* Error banner */}
        {error && (
          <div className="mb-6 bg-red-900/30 border border-red-500/30 rounded-xl p-4 text-red-300 animate-slide-up">
            <p className="font-medium text-red-200">Something went wrong</p>
            <p className="text-sm mt-1 text-red-400">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-sm underline text-red-300 hover:text-red-200 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Stage: Upload */}
        {stage === "upload" && (
          <div className="max-w-xl mx-auto animate-slide-up">
            <div className="bg-card rounded-xl shadow-lg shadow-black/20 border border-gray-700/50 p-8 card-glow">
              <h2 className="text-xl font-semibold text-gray-100 mb-2">Get Started</h2>
              <p className="text-gray-400 mb-6 text-sm">
                Upload your bank transactions (CSV or JSON) and we will analyze
                your finances to create a personalized action plan.
              </p>
              <FileUpload
                onFileSelected={handleFileSelected}
                onDemoLoad={handleDemoLoad}
                isLoading={false}
              />
            </div>
            <p className="text-center text-xs text-gray-500 mt-4">
              Your data stays on this device. We do not store or share your
              financial information.
            </p>
          </div>
        )}

        {/* Stage: Profile */}
        {stage === "profile" && (
          <div className="max-w-xl mx-auto animate-slide-up">
            <div className="bg-card rounded-xl shadow-lg shadow-black/20 border border-gray-700/50 p-8 card-glow">
              <h2 className="text-xl font-semibold text-gray-100 mb-2">A Few Details</h2>
              <p className="text-gray-400 mb-6 text-sm">
                {isDemoMode
                  ? "Using demo data. Adjust the values below if you like."
                  : `File selected: ${file?.name}. Now tell us a bit more.`}
              </p>
              <ProfileForm
                onSubmit={handleProfileSubmit}
                defaultBalance={isDemoMode ? 340 : undefined}
              />
              <button
                onClick={() => {
                  setStage("upload");
                  setIsDemoMode(false);
                  setFile(null);
                }}
                className="mt-4 text-sm text-gray-500 underline hover:text-orange-400 transition-colors"
              >
                Go back
              </button>
            </div>
          </div>
        )}

        {/* Stage: Loading */}
        {stage === "loading" && (
          <div className="max-w-xl mx-auto text-center py-20 animate-fade-in">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-orange-500/20 border-t-orange-500 mb-4" />
            <p className="text-lg font-medium text-gray-200">
              {loadingStep}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Our AI agent is analyzing your data, finding risks, and
              optimizing your plan...
            </p>
          </div>
        )}

        {/* Stage: Results */}
        {stage === "results" && result && (
          <div className="space-y-6">
            {/* Risk alerts */}
            {result.plan.risk_alerts &&
              result.plan.risk_alerts.length > 0 && (
                <div className="animate-slide-up" style={{ animationDelay: "0ms" }}>
                  <RiskAlert alerts={result.plan.risk_alerts} />
                </div>
              )}

            {/* Plan */}
            <div className="animate-slide-up" style={{ animationDelay: "100ms", animationFillMode: "both" }}>
              <PlanView plan={result.plan} />
            </div>

            {/* Two-column: Snapshot + QUBO */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-slide-up" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
              <SnapshotView snapshot={result.snapshot} />
              <QUBOVisualization
                quboResult={result.qubo_result}
                allActions={[]}
              />
            </div>

            {/* Workflow Trace */}
            <div className="animate-slide-up" style={{ animationDelay: "300ms", animationFillMode: "both" }}>
              <WorkflowTrace trace={result.trace} />
            </div>

            {/* Reset */}
            <div className="text-center pt-4 pb-12 animate-fade-in" style={{ animationDelay: "400ms", animationFillMode: "both" }}>
              <button
                onClick={handleReset}
                className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg text-white font-medium hover:from-orange-600 hover:to-amber-600 transition-all duration-300 shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40"
              >
                Start Over
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-700/50 bg-[#0d0d0d] mt-12">
        <div className="max-w-5xl mx-auto px-4 py-4 text-center text-xs text-gray-500">
          <span className="text-orange-500/60">Equity Finance Copilot</span>{" "}
          — Educational coaching only. Not financial advice. Results may vary.
          Consult a qualified financial advisor for personal decisions.
        </div>
      </footer>

      {/* ChatBot — renders when results are available */}
      {stage === "results" && result && (
        <ChatBot context={{ snapshot: result.snapshot, plan: result.plan }} />
      )}
    </main>
  );
}
