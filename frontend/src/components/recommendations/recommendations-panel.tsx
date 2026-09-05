"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  LoaderCircle,
  Plus,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";

type RecommendationDto = {
  productId: string;
  sku: string;
  name: string;
  category: string;
  price: string;
  marginPercent?: string;
  availability: "available" | "low";
  availableQuantity: number;
  type: "upsell" | "cross-sell" | "alternative";
  confidence: number;
  reason: string;
  rationale?: string;
  source: "ai" | "deterministic";
};

type RecommendationsResponse = {
  data: RecommendationDto[];
  meta: {
    customerName: string;
    aiAvailable: boolean;
    aiEnhanced: boolean;
    engine: "ai-enhanced" | "deterministic";
  };
};

const TYPE_LABELS: Record<RecommendationDto["type"], string> = {
  upsell: "Upsell",
  "cross-sell": "Cross-sell",
  alternative: "Alternative",
};

export function RecommendationsPanel({
  quotationId,
  canAdd,
}: {
  quotationId: string;
  canAdd: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendationsResponse | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/recommendations?quotationId=${encodeURIComponent(quotationId)}&limit=6`
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? "Failed to load recommendations.");
        setResult(null);
        return;
      }
      setResult(payload);
    } catch {
      setError("Failed to load recommendations.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Data fetching on mount: the async load() sets state after the effect
    // returns — the standard client-fetch pattern in this app.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotationId]);

  async function addToQuote(productId: string) {
    setAddError(null);
    setAddingId(productId);
    try {
      const response = await fetch(`/api/quotations/${quotationId}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setAddError(payload?.error?.message ?? "Failed to add product.");
        return;
      }
      router.refresh();
    } catch {
      setAddError("Failed to add product.");
    } finally {
      setAddingId(null);
    }
  }

  return (
    <Card className="bg-white">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-blue-700" aria-hidden />
            Recommended for this deal
          </CardTitle>
          <CardDescription>
            {result?.meta.engine === "ai-enhanced"
              ? "Ranked by the AI sales assistant from engine-scored candidates."
              : "Ranked by the deterministic recommendation engine."}
          </CardDescription>
        </div>
        {!loading && result?.meta.engine === "ai-enhanced" && (
          <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50">
            <Bot className="size-3" aria-hidden />
            AI ranked
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {addError && (
          <Alert variant="destructive" className="mb-4">
            <TriangleAlert className="size-4" aria-hidden />
            <AlertTitle>Could not add product</AlertTitle>
            <AlertDescription>{addError}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-36 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-start gap-3">
            <Alert variant="destructive" className="w-full">
              <TriangleAlert className="size-4" aria-hidden />
              <AlertTitle>Recommendations unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="size-3.5" aria-hidden />
              Try again
            </Button>
          </div>
        ) : result && result.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recommendations available — every product with stock is already
            on this quotation.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {result?.data.map((recommendation) => (
              <div
                key={recommendation.productId}
                className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {recommendation.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {recommendation.sku} · {recommendation.category}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                      {TYPE_LABELS[recommendation.type]}
                    </Badge>
                    {recommendation.source === "ai" ? (
                      <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50">
                        AI
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                        Engine
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium tabular-nums text-foreground">
                    {formatCurrency(Number(recommendation.price))}
                  </span>
                  <span>
                    {recommendation.availability === "low" ? (
                      <span className="text-amber-700">
                        Low stock ({recommendation.availableQuantity})
                      </span>
                    ) : (
                      "In stock"
                    )}
                  </span>
                  {recommendation.marginPercent !== undefined && (
                    <span>Margin {recommendation.marginPercent}%</span>
                  )}
                  <span>Score {recommendation.confidence}</span>
                </div>

                <p className="text-sm text-muted-foreground">
                  {recommendation.reason}
                </p>
                {recommendation.rationale && (
                  <p className="rounded-md bg-blue-50/60 px-2 py-1.5 text-xs text-blue-900">
                    {recommendation.rationale}
                  </p>
                )}

                <div className="mt-auto flex justify-end">
                  <Button
                    size="sm"
                    disabled={!canAdd || addingId !== null}
                    onClick={() => void addToQuote(recommendation.productId)}
                  >
                    {addingId === recommendation.productId ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Plus className="size-4" aria-hidden />
                    )}
                    Add to Quote
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}