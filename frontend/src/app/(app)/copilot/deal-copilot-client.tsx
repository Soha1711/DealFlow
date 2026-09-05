"use client";

import { useState } from "react";
import {
  Bot,
  Play,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  Layers,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type QuotationOption = {
  id: string;
  quotationNumber: string;
  status: string;
  customerName: string;
  total: number;
};

type StepRecord = {
  stepIndex: number;
  thought: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput?: unknown;
  error?: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED" | "AWAITING_CONFIRMATION";
  durationMs: number;
  timestamp: string;
};

type ConfirmationDetails = {
  toolName: string;
  toolParams: Record<string, unknown>;
  reason: string;
};

type AgentRunResult = {
  runId: string;
  status: "COMPLETED" | "AWAITING_CONFIRMATION" | "FAILED";
  prompt: string;
  quotationId?: string | null;
  plan: string[];
  steps: StepRecord[];
  summary: string;
  requiresConfirmation?: boolean;
  confirmationDetails?: ConfirmationDetails;
};

type AuditRunSummary = {
  id: string;
  prompt: string;
  quotationId?: string | null;
  actor: { name?: string; role: string };
  status: string;
  startedAt: string;
  steps: StepRecord[];
  finalMessage?: string;
};

export function DealCopilotClient({
  initialQuotations,
  preselectedQuotationId,
  preselectedPrompt,
  userRole,
}: {
  initialQuotations: QuotationOption[];
  preselectedQuotationId?: string;
  preselectedPrompt?: string;
  userRole: string;
}) {
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>(preselectedQuotationId || (initialQuotations[0]?.id ?? ""));
  const [prompt, setPrompt] = useState<string>(preselectedPrompt || "Prepare this quotation for approval");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"copilot" | "audit">("copilot");
  const [currentRun, setCurrentRun] = useState<AgentRunResult | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});
  const [auditRuns, setAuditRuns] = useState<AuditRunSummary[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);

  const presets = [
    {
      label: "🚀 Prepare for Approval",
      prompt: "Prepare this quotation for approval",
      roles: ["ADMIN", "SALES_REP", "SALES_MANAGER"],
    },
    {
      label: "🩺 Analyze Deal Health & Risks",
      prompt: "Analyze deal health and recommend safe next actions",
      roles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE", "OPERATIONS"],
    },
    {
      label: "📦 Resolve Fulfillment & Stock",
      prompt: "Resolve this quotation's fulfillment issues and allocate stock",
      roles: ["ADMIN", "OPERATIONS"],
    },
    {
      label: "💳 Prepare Hybrid Billing",
      prompt: "Prepare this deal for billing and generate invoices",
      roles: ["ADMIN", "FINANCE", "SALES_MANAGER"],
    },
    {
      label: "💡 Product Recommendations",
      prompt: "Check product recommendations and margin opportunities",
      roles: ["ADMIN", "SALES_REP", "SALES_MANAGER"],
    },
  ];

  const filteredPresets = presets.filter((p) => p.roles.includes(userRole));

  async function handleExecute(confirmationOverride?: ConfirmationDetails) {
    if (!prompt.trim() || isRunning) return;
    setIsRunning(true);

    try {
      const payload: Record<string, unknown> = {
        prompt: prompt.trim(),
        quotationId: selectedQuoteId || undefined,
      };

      if (confirmationOverride) {
        payload.confirmation = {
          toolName: confirmationOverride.toolName,
          params: confirmationOverride.toolParams,
        };
      }

      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setCurrentRun(data);
    } catch (err: unknown) {
      console.error("Execution failed:", err);
    } finally {
      setIsRunning(false);
    }
  }

  async function loadAuditLogs() {
    setLoadingAudit(true);
    try {
      const res = await fetch("/api/agent/audit");
      if (res.ok) {
        const data = await res.json();
        setAuditRuns(data.runs || []);
      }
    } catch (err) {
      console.error("Failed to load audit logs", err);
    } finally {
      setLoadingAudit(false);
    }
  }

  const toggleStepExpanded = (idx: number) => {
    setExpandedSteps((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const selectedQuote = initialQuotations.find((q) => q.id === selectedQuoteId);

  return (
    <div className="space-y-6">
      {/* Top Header & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Deal Copilot</h1>
              <p className="text-sm text-muted-foreground">
                Autonomous agent for end-to-end sales operations, governance, fulfillment, and billing automation.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-3 py-1 font-mono text-xs">
            Role: {userRole}
          </Badge>
          <div className="flex rounded-md border bg-muted/40 p-1">
            <button
              onClick={() => setActiveTab("copilot")}
              className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === "copilot" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Copilot Engine
            </button>
            <button
              onClick={() => {
                setActiveTab("audit");
                void loadAuditLogs();
              }}
              className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === "audit" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <History className="h-3.5 w-3.5" />
              Audit Trail
            </button>
          </div>
        </div>
      </div>

      {activeTab === "copilot" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left / Control Panel */}
          <div className="lg:col-span-5 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" /> Target Deal & Task
                </CardTitle>
                <CardDescription>
                  Select an active quotation and dispatch autonomous multi-step operations.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Quotation Selector */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Target Quotation
                  </label>
                  <select
                    value={selectedQuoteId}
                    onChange={(e) => setSelectedQuoteId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">(None / Infer from task prompt)</option>
                    {initialQuotations.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.quotationNumber} — {q.customerName} (${Number(q.total).toFixed(2)}) [{q.status}]
                      </option>
                    ))}
                  </select>
                </div>

                {selectedQuote && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge variant="outline">{selectedQuote.status}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Customer:</span>
                      <span className="font-medium">{selectedQuote.customerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Commercial Total:</span>
                      <span className="font-semibold text-emerald-600">${Number(selectedQuote.total).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Preset Chips */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-2">
                    Quick Operational Presets
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {filteredPresets.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setPrompt(p.prompt)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                          prompt === p.prompt
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border/60 hover:border-primary/40 bg-background text-muted-foreground"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Natural Language Task Input */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Task Prompt
                  </label>
                  <Input
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. Prepare this quotation for approval"
                    onKeyDown={(e) => e.key === "Enter" && handleExecute()}
                    disabled={isRunning}
                  />
                </div>

                <Button
                  onClick={() => handleExecute()}
                  disabled={isRunning || !prompt.trim()}
                  className="w-full gap-2 font-medium"
                >
                  {isRunning ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Executing Multi-Step Plan...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Run Autonomous Agent
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Confirmation Gate Card */}
            {currentRun?.status === "AWAITING_CONFIRMATION" && currentRun.confirmationDetails && (
              <Card className="border-amber-500 bg-amber-50/40 dark:bg-amber-950/20">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold text-sm">
                    <ShieldAlert className="h-5 w-5" /> High-Impact Action Confirmation Required
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <p className="text-muted-foreground">
                    {currentRun.confirmationDetails.reason}
                  </p>
                  <div className="rounded bg-muted p-2 font-mono text-[11px] overflow-x-auto">
                    <div>Tool: <span className="text-amber-600 font-bold">{currentRun.confirmationDetails.toolName}</span></div>
                    <div>Params: {JSON.stringify(currentRun.confirmationDetails.toolParams)}</div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={() => handleExecute(currentRun.confirmationDetails)}
                      disabled={isRunning}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Confirm & Proceed
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentRun(null)}
                      disabled={isRunning}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right / Live Execution & Results */}
          <div className="lg:col-span-7 space-y-6">
            {!currentRun && !isRunning && (
              <Card className="border-dashed flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <Bot className="h-12 w-12 stroke-[1.5] text-muted-foreground/60 mb-3" />
                <h3 className="font-semibold text-foreground text-sm">Agent Ready for Automation</h3>
                <p className="text-xs max-w-sm mt-1">
                  Choose a quotation or type an instruction on the left. The agent will formulate a plan, verify RBAC permissions, invoke domain services, and complete the workflow.
                </p>
              </Card>
            )}

            {currentRun && (
              <div className="space-y-6">
                {/* Plan Overview Card */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" /> Execution Plan
                      </CardTitle>
                      <Badge
                        variant={
                          currentRun.status === "COMPLETED"
                            ? "default"
                            : currentRun.status === "AWAITING_CONFIRMATION"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {currentRun.status}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Run ID: <span className="font-mono">{currentRun.runId}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="space-y-1.5">
                      {currentRun.plan.map((stepDesc, idx) => {
                        const executed = currentRun.steps[idx];
                        return (
                          <div
                            key={idx}
                            className="flex items-center gap-2.5 text-xs rounded-md px-2.5 py-1.5 bg-muted/40 border"
                          >
                            <div className="flex-shrink-0">
                              {executed?.status === "SUCCESS" ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              ) : executed?.status === "AWAITING_CONFIRMATION" ? (
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                              ) : executed?.status === "FAILED" ? (
                                <XCircle className="h-4 w-4 text-red-500" />
                              ) : (
                                <Clock className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <span className="font-medium text-foreground/90 font-mono text-[11px]">
                              Step {idx + 1}:
                            </span>
                            <span className="text-muted-foreground flex-1 truncate">{stepDesc}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Step-by-Step Tool Trace */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Execution Trace & Tool Calls ({currentRun.steps.length})
                  </h3>
                  <div className="space-y-2.5">
                    {currentRun.steps.map((step) => {
                      const isExpanded = expandedSteps[step.stepIndex];
                      return (
                        <Card key={step.stepIndex} className="overflow-hidden border-border/80">
                          <div
                            className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => toggleStepExpanded(step.stepIndex)}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Badge
                                variant={
                                  step.status === "SUCCESS"
                                    ? "default"
                                    : step.status === "AWAITING_CONFIRMATION"
                                    ? "secondary"
                                    : "destructive"
                                }
                                className="font-mono text-[10px] px-2"
                              >
                                {step.toolName}
                              </Badge>
                              <span className="text-xs font-medium truncate">{step.thought}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {step.durationMs}ms
                              </span>
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="border-t bg-muted/20 p-3 text-xs space-y-2">
                              <div>
                                <span className="font-semibold text-[11px] text-muted-foreground uppercase">
                                  Input Parameters:
                                </span>
                                <pre className="mt-1 rounded bg-muted/60 p-2 font-mono text-[11px] overflow-x-auto">
                                  {JSON.stringify(step.toolInput, null, 2)}
                                </pre>
                              </div>
                              {step.toolOutput !== undefined && step.toolOutput !== null ? (
                                <div>
                                  <span className="font-semibold text-[11px] text-muted-foreground uppercase">
                                    Tool Result:
                                  </span>
                                  <pre className="mt-1 rounded bg-muted/60 p-2 font-mono text-[11px] max-h-48 overflow-y-auto">
                                    {JSON.stringify(step.toolOutput, null, 2)}
                                  </pre>
                                </div>
                              ) : null}
                              {step.error && (
                                <div className="text-red-500 font-medium text-xs">
                                  Error: {step.error}
                                </div>
                              )}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>

                {/* Final Outcome Summary Box */}
                {currentRun.summary && (
                  <Card className="border-emerald-500/50 bg-emerald-50/20 dark:bg-emerald-950/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" /> Agent Operational Outcome
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs text-foreground/90 whitespace-pre-wrap font-sans leading-relaxed">
                        {currentRun.summary}
                      </pre>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audit Trail Tab */}
      {activeTab === "audit" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" /> Copilot Operational Audit Trail
                </CardTitle>
                <CardDescription>
                  Immutable audit records of all agent executions, tools invoked, and security policies applied.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={loadAuditLogs} disabled={loadingAudit} className="gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${loadingAudit ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingAudit ? (
              <div className="p-8 text-center text-xs text-muted-foreground">Loading audit records...</div>
            ) : auditRuns.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">No agent runs recorded in this session.</div>
            ) : (
              <div className="space-y-4">
                {auditRuns.map((r) => (
                  <div key={r.id} className="rounded-lg border p-4 text-xs space-y-2 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            r.status === "COMPLETED"
                              ? "default"
                              : r.status === "AWAITING_CONFIRMATION"
                              ? "secondary"
                              : "destructive"
                          }
                          className="font-mono text-[10px]"
                        >
                          {r.status}
                        </Badge>
                        <span className="font-semibold text-foreground">{r.prompt}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {new Date(r.startedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground text-[11px]">
                      <span>Actor: <strong className="text-foreground">{r.actor.name || r.actor.role}</strong> ({r.actor.role})</span>
                      {r.quotationId && <span>Target Quote: <strong className="text-foreground font-mono">{r.quotationId}</strong></span>}
                      <span>Steps: <strong className="text-foreground">{r.steps.length}</strong></span>
                    </div>
                    {r.finalMessage && (
                      <p className="text-muted-foreground pt-1 border-t text-[11px] line-clamp-2">
                        {r.finalMessage}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
