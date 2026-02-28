"use client";

import { useState, useCallback } from "react";
import { t } from "../lib/translations";
import Logo from "../components/Logo";
import FileUpload from "../components/FileUpload";
import ProfileForm from "../components/ProfileForm";
import SnapshotView from "../components/SnapshotView";
import PlanView from "../components/PlanView";
import RiskAlert from "../components/RiskAlert";
import ChatBot from "../components/ChatBot";
import ConversationalIntake from "../components/ConversationalIntake";
import ScenarioSimulator from "../components/ScenarioSimulator";
import CategoryPieChart from "../components/CategoryPieChart";
import CollapsibleSection from "../components/CollapsibleSection";
import EquityCurve from "../components/EquityCurve";
import LanguageSelector from "../components/LanguageSelector";
import type { CopilotResponse } from "../lib/types";

type AppMode = "copilot" | "scenario";
type Stage = "upload" | "chat-intake" | "profile" | "loading" | "results" | "scenario-results";

export default function Home() {
  const [stage, setStage] = useState<Stage>("upload");
  const [appMode, setAppMode] = useState<AppMode>("copilot");
  const [file, setFile] = useState<File | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [result, setResult] = useState<CopilotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState("");
  const [sessionKey, setSessionKey] = useState(0);
  const [showAbout, setShowAbout] = useState(false);
  const [showFooterAbout, setShowFooterAbout] = useState(false);
  const [lang, setLang] = useState("en");
  const [showTop3, setShowTop3] = useState(false);
  const [scenarioTransactions, setScenarioTransactions] = useState<Array<{ date: string; description: string; amount: number; category?: string }> | null>(null);
  const [scenarioNormalizer, setScenarioNormalizer] = useState<{
    schemaMap: Array<{ sourceColumn: string; internalField: string; confidence: number; method: string }>;
    warnings: string[];
    transactionCount: number;
  } | null>(null);

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
    async (profile: { checking_balance: number; goal: string; monthly_income?: number }) => {
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

  const handleIntakeComplete = useCallback(
    async (data: {
      csvContent: string;
      profile: {
        checking_balance: number;
        monthly_income: number;
        goal: string;
        debts?: Array<{ name: string; balance: number; apr: number; minimum_payment: number; due_day: number }>;
        income?: Array<{ source: string; amount: number; frequency: "monthly"; next_date: string }>;
      };
    }) => {
      setStage("loading");
      setError(null);
      setLoadingStep("Building your financial profile...");

      try {
        const formData = new FormData();
        const csvBlob = new Blob([data.csvContent], { type: "text/csv" });
        formData.append("file", csvBlob, "ai_intake.csv");
        formData.append("profile", JSON.stringify(data.profile));

        setLoadingStep("AI agent is analyzing your finances...");

        const res = await fetch("/api/pipeline", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server error: ${res.status}`);
        }

        const result: CopilotResponse = await res.json();
        setResult(result);
        setStage("results");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
        setError(message);
        setStage("upload");
      }
    },
    []
  );

  const handleScenarioUpload = useCallback(async (f: File) => {
    setStage("loading");
    setError(null);
    setLoadingStep("Parsing your financial data...");

    try {
      const formData = new FormData();
      formData.append("file", f);

      const res = await fetch("/api/scenario", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${res.status}`);
      }

      const data = await res.json();
      setScenarioTransactions(data.transactions);
      setScenarioNormalizer(data.normalizer);
      setStage("scenario-results");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setStage("upload");
    }
  }, []);

  const handleReset = useCallback(() => {
    setStage("upload");
    setFile(null);
    setIsDemoMode(false);
    setResult(null);
    setError(null);
    setSessionKey((k) => k + 1);
    setScenarioTransactions(null);
    setScenarioNormalizer(null);
    setAppMode("copilot");
    setShowTop3(false);
  }, []);

  // Filter out fake risk alerts
  const realAlerts = result?.plan?.risk_alerts?.filter(
    (a: string) => !/no\s*(urgent)?\s*risk/i.test(a) && !/no\s*alerts/i.test(a) && a.trim().length > 10
  ) ?? [];

  return (
    <main className="relative min-h-screen text-slate-100 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/65 backdrop-blur-xl border-b border-cyan-500/10 shadow-[0_14px_45px_-28px_rgba(2,6,23,0.95)]">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3.5 md:py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo size="md" />
          <LanguageSelector currentLang={lang} onLanguageChange={setLang} />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-14 animate-fade-in">
        {/* Error banner */}
        {error && (
          <div className="mb-8 bg-red-950/20 backdrop-blur-md border border-red-500/10 rounded-2xl p-5 text-red-300 animate-slide-up shadow-lg shadow-red-950/20">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-bold text-red-200">Something went wrong</p>
                <p className="text-sm mt-1 text-red-300/80 leading-relaxed tracking-wide">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="mt-3 text-xs font-bold uppercase tracking-wider text-red-400 hover:text-red-300 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hero Section (upload stage only) */}
        {stage === "upload" && (
          <section className="mb-10 text-center animate-slide-up">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200/90 mb-5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse" />
              {t(lang, "privateBadge")}
            </div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight text-slate-50 text-balance">
              {t(lang, "heroTitle")}
            </h1>
            <p className="mt-4 max-w-2xl mx-auto text-sm md:text-base text-slate-300/85 leading-relaxed text-balance">
              {t(lang, "heroSubtitle")}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 text-[11px] font-semibold text-slate-300/80">
              <span className="px-3 py-1.5 rounded-full border border-slate-700/70 bg-slate-900/45">{t(lang, "noSignup")}</span>
              <span className="px-3 py-1.5 rounded-full border border-slate-700/70 bg-slate-900/45">{t(lang, "csvJsonIntake")}</span>
              <span className="px-3 py-1.5 rounded-full border border-slate-700/70 bg-slate-900/45">{t(lang, "actionFirst")}</span>
            </div>
          </section>
        )}

        {/* About dropdown (upload stage only) */}
        {stage === "upload" && appMode === "copilot" && (
          <div className="mb-10 text-center">
            <button
              onClick={() => setShowAbout(!showAbout)}
              className="text-sm font-medium text-slate-400 hover:text-cyan-300 transition-all inline-flex items-center justify-center gap-2 group mx-auto px-4 py-2 rounded-full hover:bg-white/5 border border-transparent hover:border-cyan-500/20"
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center border border-slate-700 group-hover:border-cyan-400/60 transition-colors ${showAbout ? 'bg-cyan-500/10 border-cyan-400/60' : ''}`}>
                <svg className={`w-3 h-3 transition-transform duration-300 ${showAbout ? 'rotate-90 text-cyan-300' : 'text-slate-500 group-hover:text-cyan-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              {t(lang, "whatIsEquity")}
            </button>
            {showAbout && (
              <div className="mt-6 glass-card p-8 text-sm text-slate-300 space-y-6 animate-slide-up border-cyan-500/15 shadow-cyan-500/5 text-left relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 blur-3xl -mr-32 -mt-32 rounded-full pointer-events-none" />

                <p className="leading-loose text-base relative z-10"><strong className="text-cyan-300 font-semibold italic">Equity Finance Copilot</strong> is an AI-powered financial coaching tool powered by IBM watsonx.ai and quantum-inspired optimization. It analyzes your transactions, detects risks, and creates personalized weekly action plans — designed for everyone, especially those underserved by traditional banking.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                  <div className="space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{t(lang, "keyFeatures")}</p>
                    <ul className="space-y-3">
                      {[
                        "AI-powered spending analysis",
                        "Overdraft risk prediction",
                        "Subscription leak detection",
                        "Quantum-inspired action optimization (QUBO)",
                        "90-day balance projection",
                        "IBM watsonx.ai financial chatbot"
                      ].map((item, i) => (
                        <li key={i} className="flex items-center gap-3 text-slate-400 group hover:text-slate-200 transition-colors">
                          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 group-hover:scale-125 transition-transform duration-300 shadow-[0_0_8px_rgba(56,189,248,0.4)]" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-slate-950/30 rounded-xl p-6 flex flex-col justify-center border border-white/5 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent pointer-events-none" />
                    <p className="text-slate-400 text-sm italic leading-loose relative z-10">
                      &ldquo;{t(lang, "builtWithEquity")}&rdquo;
                    </p>
                    <div className="h-px w-12 bg-cyan-500/30 my-4" />
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest relative z-10">{t(lang, "educationalOnly")}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stage: Upload */}
        {stage === "upload" && (
          <div className="animate-slide-up space-y-6">
            {/* Mode Selector */}
            <div className="glass-card p-1.5 flex gap-1">
              <button
                onClick={() => setAppMode("copilot")}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold tracking-tight transition-all duration-300 ${
                  appMode === "copilot"
                    ? "bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-lg shadow-cyan-500/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                }`}
              >
                {t(lang, "financialCopilot")}
              </button>
              <button
                onClick={() => setAppMode("scenario")}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold tracking-tight transition-all duration-300 ${
                  appMode === "scenario"
                    ? "bg-gradient-to-r from-blue-500 to-violet-500 text-white shadow-lg shadow-blue-500/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                }`}
              >
                {t(lang, "scenarioSimulator")}
              </button>
            </div>

            {/* Copilot Upload Card */}
            {appMode === "copilot" && (
              <>
                <div className="glass-card relative overflow-hidden p-6 md:p-10 card-glow border-cyan-500/15 shadow-black/40">
                  <div className="absolute -top-28 -right-20 w-72 h-72 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-400/30 flex-shrink-0">
                      <svg className="w-6 h-6 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold text-slate-100 tracking-tight">{t(lang, "getStarted")}</h2>
                      <p className="text-slate-300/85 text-sm mt-1 max-w-xl">{t(lang, "upload")}</p>
                    </div>
                  </div>

                  <FileUpload
                    key={sessionKey}
                    onFileSelected={handleFileSelected}
                    onDemoLoad={handleDemoLoad}
                    isLoading={false}
                    lang={lang}
                  />
                </div>

                {/* AI Conversation Option */}
                <div className="relative py-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-700/60" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-4 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 bg-slate-950/80 rounded-full border border-slate-800/70">
                      {t(lang, "securePrivate")}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setStage("chat-intake")}
                  className="w-full glass-card p-6 md:p-8 card-glow text-left hover:border-cyan-400/45 transition-all duration-300 group shadow-black/40 relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-emerald-400/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                    <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-emerald-400/10 border border-cyan-500/25 flex items-center justify-center group-hover:scale-110 group-hover:bg-cyan-500/20 transition-all duration-500">
                      <svg className="w-7 h-7 text-cyan-300 group-hover:text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-slate-100 group-hover:text-cyan-300 transition-colors">
                        {t(lang, "talkToAI")}
                      </h3>
                      <p className="text-sm text-slate-300/85 mt-2 leading-relaxed">
                        {t(lang, "talkToAISubtitle")}
                      </p>
                    </div>
                    <div className="hidden sm:flex w-10 h-10 rounded-full border border-slate-700 items-center justify-center group-hover:border-cyan-400/50 group-hover:bg-cyan-500/10 transition-all duration-300">
                      <svg className="w-5 h-5 text-slate-500 group-hover:text-cyan-300 transition-transform duration-300 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </button>
              </>
            )}

            {/* Scenario Simulator Upload Card */}
            {appMode === "scenario" && (
              <div className="glass-card relative overflow-hidden p-6 md:p-10 card-glow border-blue-500/15 shadow-black/40">
                <div className="absolute -top-28 -right-20 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-400/30 flex-shrink-0">
                    <svg className="w-6 h-6 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold text-slate-100 tracking-tight">{t(lang, "scenarioSimulator")}</h2>
                    <p className="text-slate-300/85 text-sm mt-1 max-w-xl">
                      Upload your transactions and simulate financial what-if scenarios — rent spikes, medical emergencies, job loss, and more.
                    </p>
                  </div>
                </div>
                <FileUpload
                  key={`scenario-${sessionKey}`}
                  onFileSelected={handleScenarioUpload}
                  onDemoLoad={() => {
                    fetch("/demo/demo_transactions.csv")
                      .then(r => r.blob())
                      .then(blob => {
                        const file = new File([blob], "demo_transactions.csv", { type: "text/csv" });
                        handleScenarioUpload(file);
                      })
                      .catch(() => setError("Failed to load demo data."));
                  }}
                  isLoading={false}
                  lang={lang}
                />
              </div>
            )}


            <div className="flex items-center justify-center gap-2 text-slate-600 text-[10px] font-bold uppercase tracking-widest pt-2">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {t(lang, "noDataStored")}
            </div>
          </div>
        )}

        {/* Stage: Chat Intake */}
        {stage === "chat-intake" && (
          <div className="max-w-2xl mx-auto animate-slide-up">
            <ConversationalIntake
              key={sessionKey}
              onComplete={handleIntakeComplete}
              onBack={() => setStage("upload")}
              lang={lang}
            />
          </div>
        )}

        {/* Stage: Scenario Results */}
        {stage === "scenario-results" && scenarioTransactions && (
          <div className="max-w-5xl mx-auto animate-slide-up">
            <ScenarioSimulator
              transactions={scenarioTransactions}
              normalizer={scenarioNormalizer ?? undefined}
              onBack={handleReset}
            />
          </div>
        )}


        {/* Stage: Profile */}
        {stage === "profile" && (
          <div className="max-w-xl mx-auto animate-slide-up">
            <div className="glass-card p-10 card-glow border-teal-500/10 shadow-black/40">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-teal-500/10 flex items-center justify-center border border-teal-500/20">
                  <svg className="w-6 h-6 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-100 tracking-tight">{t(lang, "fewDetails")}</h2>
                  <p className="text-slate-400 text-sm mt-0.5 leading-relaxed">
                    {isDemoMode
                      ? "Using demo data. Adjust the values below if you like."
                      : `File selected: ${file?.name}. Now tell us a bit more.`}
                  </p>
                </div>
              </div>

              <ProfileForm
                key={sessionKey}
                onSubmit={handleProfileSubmit}
                defaultBalance={isDemoMode ? 340 : undefined}
                lang={lang}
              />

              <div className="mt-8 pt-6 border-t border-slate-800/60 text-center">
                <button
                  onClick={() => {
                    setStage("upload");
                    setIsDemoMode(false);
                    setFile(null);
                  }}
                  className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-widest hover:text-teal-400 transition-colors group"
                >
                  <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                  </svg>
                  {t(lang, "goBack")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stage: Loading */}
        {stage === "loading" && (
          <div className="max-w-xl mx-auto text-center py-20 animate-fade-in">
            <div className="relative inline-block mb-10">
              <div className="absolute inset-0 rounded-full bg-teal-500/20 blur-2xl animate-pulse" />
              <div className="relative w-20 h-20 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-100 tracking-tight mb-2">
              {loadingStep}
            </h3>
            <p className="text-slate-400 max-w-sm mx-auto leading-relaxed">
              Our AI agent is analyzing your data, finding risks, and
              optimizing your plan...
            </p>
          </div>
        )}

        {/* Stage: Results */}
        {stage === "results" && result && (
          <div className="space-y-8 max-w-5xl mx-auto">

            {/* 1. KPI Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 animate-slide-up">
              {/* Current Cash */}
              <div className="glass-card p-5 flex flex-col justify-center border-l-4 border-l-indigo-500">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">{t(lang, "currentCash")}</span>
                <span className="text-2xl font-black text-slate-100 tracking-tight">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(result.snapshot.checking_balance)}
                </span>
              </div>

              {/* Top 3 Priority Actions Dropdown */}
              <div className="glass-card p-5 flex flex-col justify-center border-l-4 border-l-cyan-500 relative">
                <button
                  onClick={() => setShowTop3(!showTop3)}
                  className="w-full text-left flex items-center justify-between"
                >
                  <div>
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1 block">{t(lang, "top3Actions")}</span>
                    <span className="text-lg font-bold text-cyan-400 tracking-tight">
                      {result.plan.week_1.slice(0, 3).length} Actions
                    </span>
                  </div>
                  <svg
                    className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${showTop3 ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showTop3 && (
                  <div className="mt-3 space-y-2 animate-slide-up">
                    {result.plan.week_1.slice(0, 3).map((action, i) => (
                      <div
                        key={action.action_id || i}
                        className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50"
                      >
                        <div className="flex items-start gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-200 truncate">{action.action_name}</p>
                            <p className="text-xs text-emerald-400 mt-0.5">{action.estimated_savings}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Potential Savings */}
              <div className="glass-card p-5 flex flex-col justify-center border-l-4 border-l-emerald-500">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">{t(lang, "potentialSavings")}</span>
                <span className="text-xl font-black text-emerald-400 tracking-tight">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(result.plan.total_estimated_monthly_savings[0])}
                  <span className="text-slate-500 text-sm font-medium mx-1">&ndash;</span>
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(result.plan.total_estimated_monthly_savings[1])}
                  <span className="text-xs text-slate-500 font-medium ml-1">/mo</span>
                </span>
              </div>
            </div>

            {/* 2. Risk Alerts (Only if real alerts exist) */}
            {realAlerts.length > 0 && (
              <div className="animate-slide-up" style={{ animationDelay: "100ms", animationFillMode: "both" }}>
                <RiskAlert alerts={realAlerts} />
              </div>
            )}

            {/* 3. Visuals — Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
              {/* 90-Day Balance Projection */}
              <div className="animate-slide-up" style={{ animationDelay: "150ms", animationFillMode: "both" }}>
                <EquityCurve snapshot={result.snapshot} />
              </div>

              {/* Spending by Category */}
              {result.normalizer && result.normalizer.totalSpend > 0 && (
                <div className="animate-slide-up" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
                  <CategoryPieChart
                    categoryTotals={result.normalizer.categoryTotals}
                    totalSpend={result.normalizer.totalSpend}
                  />
                </div>
              )}
            </div>

            {/* 4. Action Plan */}
            <div className="animate-slide-up" style={{ animationDelay: "300ms", animationFillMode: "both" }}>
              <CollapsibleSection
                title={t(lang, "yourActionPlan")}
                subtitle={t(lang, "personalizedSteps")}
                defaultOpen={true}
              >
                <PlanView plan={result.plan} lang={lang} />
              </CollapsibleSection>
            </div>

            {/* 5. Financial Details */}
            <div className="animate-slide-up" style={{ animationDelay: "350ms", animationFillMode: "both" }}>
              <CollapsibleSection
                title={t(lang, "financialDetails")}
                subtitle={t(lang, "snapshotSubtitle")}
                defaultOpen={false}
              >
                <SnapshotView snapshot={result.snapshot} lang={lang} />
              </CollapsibleSection>
            </div>

            {/* 5. Start Over */}
            <div className="text-center pt-12 pb-20 animate-fade-in" style={{ animationDelay: "700ms", animationFillMode: "both" }}>
              <button
                onClick={handleReset}
                className="btn-secondary inline-flex items-center gap-2 group"
              >
                <svg className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {t(lang, "startOver")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-cyan-500/10 bg-slate-950/45 backdrop-blur-xl mt-12 py-12 md:py-14">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <div className="flex flex-col items-center gap-6">
            <Logo size="sm" showTagline={false} />
            <div className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500">
              <span className="text-cyan-400/90">Equity Finance Copilot</span>{" "}
              — {t(lang, "footerTagline")}
            </div>

            <button
              onClick={() => setShowFooterAbout(!showFooterAbout)}
              className="text-xs font-bold uppercase tracking-widest text-cyan-300/70 hover:text-cyan-200 transition-all px-4 py-2 rounded-full border border-cyan-500/20 hover:border-cyan-400/40 hover:bg-cyan-500/10"
            >
              {showFooterAbout ? t(lang, "closeInfo") : t(lang, "learnMore")}
            </button>

            {showFooterAbout && (
              <div className="mt-4 max-w-xl mx-auto glass-card p-8 text-left animate-slide-up">
                <h4 className="text-sm font-bold text-slate-100 uppercase tracking-widest mb-4">{t(lang, "whatWeProvide")}</h4>
                <ul className="space-y-3">
                  {[
                    "AI-powered financial snapshot and risk analysis",
                    "Quantum-ready optimization (QUBO) for action planning",
                    "90-day balance projection with bill/income forecasting",
                    "Subscription leak detection and debt payoff strategies",
                    "Personalized weekly coaching plan"
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-slate-400 leading-relaxed">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-6 pt-6 border-t border-slate-800/60">
                  <p className="text-slate-500 text-xs italic leading-loose">{t(lang, "footerDisclaimer")}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </footer>

      {/* ChatBot — renders when results are available */}
      {stage === "results" && result && (
        <ChatBot context={{ snapshot: result.snapshot, plan: result.plan }} lang={lang} />
      )}
    </main>
  );
}
