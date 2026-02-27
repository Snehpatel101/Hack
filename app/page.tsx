"use client";

import { useState, useCallback } from "react";
import FileUpload from "../components/FileUpload";
import ProfileForm from "../components/ProfileForm";
import SnapshotView from "../components/SnapshotView";
import PlanView from "../components/PlanView";
import WorkflowTrace from "../components/WorkflowTrace";
import QUBOVisualization from "../components/QUBOVisualization";
import RiskAlert from "../components/RiskAlert";
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
      <header className="bg-indigo-700 text-white">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold tracking-tight">
            Equity Finance Copilot
          </h1>
          <p className="text-indigo-200 mt-1 text-sm">
            AI-powered coaching to stabilize cashflow, pay off debt, and build
            savings
          </p>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Error banner */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
            <p className="font-medium">Something went wrong</p>
            <p className="text-sm mt-1">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-sm underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Stage: Upload */}
        {stage === "upload" && (
          <div className="max-w-xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm p-8">
              <h2 className="text-xl font-semibold mb-2">Get Started</h2>
              <p className="text-slate-500 mb-6 text-sm">
                Upload your bank transactions (CSV or JSON) and we will analyze
                your finances to create a personalized action plan.
              </p>
              <FileUpload
                onFileSelected={handleFileSelected}
                onDemoLoad={handleDemoLoad}
                isLoading={false}
              />
            </div>
            <p className="text-center text-xs text-slate-400 mt-4">
              Your data stays on this device. We do not store or share your
              financial information.
            </p>
          </div>
        )}

        {/* Stage: Profile */}
        {stage === "profile" && (
          <div className="max-w-xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm p-8">
              <h2 className="text-xl font-semibold mb-2">A Few Details</h2>
              <p className="text-slate-500 mb-6 text-sm">
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
                className="mt-4 text-sm text-slate-400 underline"
              >
                Go back
              </button>
            </div>
          </div>
        )}

        {/* Stage: Loading */}
        {stage === "loading" && (
          <div className="max-w-xl mx-auto text-center py-20">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-indigo-200 border-t-indigo-600 mb-4" />
            <p className="text-lg font-medium text-slate-700">
              {loadingStep}
            </p>
            <p className="text-sm text-slate-400 mt-2">
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
                <RiskAlert alerts={result.plan.risk_alerts} />
              )}

            {/* Plan */}
            <PlanView plan={result.plan} />

            {/* Two-column: Snapshot + QUBO */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SnapshotView snapshot={result.snapshot} />
              <QUBOVisualization
                quboResult={result.qubo_result}
                allActions={[]}
              />
            </div>

            {/* Workflow Trace */}
            <WorkflowTrace trace={result.trace} />

            {/* Reset */}
            <div className="text-center pt-4 pb-12">
              <button
                onClick={handleReset}
                className="px-6 py-2 bg-slate-200 rounded-lg text-slate-700 hover:bg-slate-300 transition"
              >
                Start Over
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-5xl mx-auto px-4 py-4 text-center text-xs text-slate-400">
          Equity Finance Copilot — Educational coaching only. Not financial
          advice. Results may vary. Consult a qualified financial advisor for
          personal decisions.
        </div>
      </footer>
    </main>
  );
}
