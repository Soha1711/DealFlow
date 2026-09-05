"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, Save, Send, Trash2, TriangleAlert } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/format";

export type CustomerOption = {
  id: string;
  name: string;
};

export type ProductOption = {
  id: string;
  name: string;
  sku: string;
  price: number;
  cost: number;
  maxDiscountPercent: number;
  isRecurring: boolean;
};

export type QuotationFormLine = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
};

export type QuotationFormInitial = {
  customerId: string;
  validUntil: string | null;
  lines: QuotationFormLine[];
};

const lineFormSchema = z.object({
  productId: z.string().min(1, "Select a product"),
  quantity: z
    .number({ message: "Enter a quantity" })
    .int("Whole number required")
    .positive("Must be greater than 0"),
  unitPrice: z.number({ message: "Enter a price" }).min(0, "Must be 0 or greater"),
  discountPercent: z
    .number({ message: "Enter a percentage" })
    .min(0, "Minimum 0%")
    .max(100, "Maximum 100%"),
});

const formSchema = z.object({
  customerId: z.string().min(1, "Select a customer"),
  validUntil: z.string().optional(),
  lines: z.array(lineFormSchema).min(1, "Add at least one product line"),
});

type FormValues = z.infer<typeof formSchema>;

type PreviewLine = {
  gross: number;
  discount: number;
  lineTotal: number;
  margin: number;
};

export function QuotationForm({
  customers,
  products,
  mode,
  quotationId,
  initial,
}: {
  customers: CustomerOption[];
  products: ProductOption[];
  mode: "create" | "edit";
  quotationId?: string;
  initial?: QuotationFormInitial;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<"save" | "submit" | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const defaultLine: QuotationFormLine = {
    productId: "",
    quantity: 1,
    unitPrice: 0,
    discountPercent: 0,
  };

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: initial?.customerId ?? "",
      validUntil: initial?.validUntil ?? "",
      lines:
        initial && initial.lines.length > 0
          ? initial.lines
          : [defaultLine],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lines",
  });

  const watchedLines = useWatch({ control, name: "lines" });
  const watchedCustomerId = useWatch({ control, name: "customerId" });

  /** Live preview only — the server recalculates everything authoritatively. */
  const preview = (() => {
    const lines: PreviewLine[] = watchedLines.map((line) => {
      const product = products.find((p) => p.id === line.productId);
      const quantity = Number(line.quantity) || 0;
      const unitPrice = Number(line.unitPrice) || 0;
      const discountPercent = Number(line.discountPercent) || 0;
      const gross = quantity * unitPrice;
      const discount = (gross * discountPercent) / 100;
      const lineTotal = gross - discount;
      const margin = lineTotal - quantity * (product?.cost ?? 0);
      return { gross, discount, lineTotal, margin };
    });
    return {
      lines,
      subtotal: lines.reduce((sum, line) => sum + line.gross, 0),
      discountTotal: lines.reduce((sum, line) => sum + line.discount, 0),
      total: lines.reduce((sum, line) => sum + line.lineTotal, 0),
      margin: lines.reduce((sum, line) => sum + line.margin, 0),
    };
  })();

  function handleProductChange(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    setValue(`lines.${index}.productId`, productId);
    if (product) {
      setValue(`lines.${index}.unitPrice`, product.price);
      setValue(`lines.${index}.discountPercent`, 0);
    }
  }

  async function submit(values: FormValues, action: "save" | "submit") {
    setServerError(null);

    const payload = {
      customerId: values.customerId,
      validUntil: values.validUntil
        ? new Date(`${values.validUntil}T12:00:00`).toISOString()
        : null,
      lines: values.lines.map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        discountPercent: Number(line.discountPercent),
      })),
    };

    try {
      let quotationIdValue = quotationId;

      if (mode === "create") {
        const response = await fetch("/api/quotations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setServerError(data?.error?.message ?? "Failed to save quotation.");
          return;
        }
        quotationIdValue = data.data.id as string;
      } else {
        const response = await fetch(`/api/quotations/${quotationIdValue}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setServerError(data?.error?.message ?? "Failed to update quotation.");
          return;
        }
      }

      if (action === "submit" && quotationIdValue) {
        const response = await fetch(`/api/quotations/${quotationIdValue}/submit`, {
          method: "POST",
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setServerError(data?.error?.message ?? "Failed to submit quotation.");
          return;
        }
      }

      router.push(`/quotations/${quotationIdValue}`);
      router.refresh();
    } catch {
      setServerError("An unexpected error occurred. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  const isSubmitting = pendingAction !== null;

  return (
    <div className="flex flex-col gap-6">
      {serverError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Unable to save</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <Card className="bg-white">
        <CardHeader>
          <CardTitle>Customer</CardTitle>
          <CardDescription>
            Select the customer this quotation is prepared for.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer">Customer</Label>
              <Select
                value={watchedCustomerId}
                onValueChange={(value) => setValue("customerId", value)}
              >
                <SelectTrigger
                  id="customer"
                  className="w-full"
                  aria-invalid={Boolean(errors.customerId)}
                >
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.customerId && (
                <p className="text-xs text-red-700">{errors.customerId.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="validUntil">Valid until (optional)</Label>
              <Input
                id="validUntil"
                type="date"
                {...register("validUntil")}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to keep the quotation valid indefinitely.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>Product lines</CardTitle>
            <CardDescription>
              Add the products, quantities and discounts for this quotation.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ ...defaultLine })}
          >
            <Plus className="size-3.5" aria-hidden />
            Add line
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {errors.lines?.root && (
              <p className="text-xs text-red-700">{errors.lines.root.message}</p>
            )}

            {fields.map((field, index) => {
              const product = products.find(
                (p) => p.id === watchedLines[index]?.productId
              );
              const linePreview = preview.lines[index];
              const lineErrors = errors.lines?.[index];

              return (
                <div
                  key={field.id}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-12">
                    <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-4">
                      <Label>Product</Label>
                      <Select
                        value={watchedLines[index]?.productId ?? ""}
                        onValueChange={(value) => handleProductChange(index, value)}
                      >
                        <SelectTrigger
                          className="w-full"
                          aria-invalid={Boolean(lineErrors?.productId)}
                        >
                          <SelectValue placeholder="Select a product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                              <span className="text-muted-foreground">
                                {" "}
                                · {p.sku}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {lineErrors?.productId && (
                        <p className="text-xs text-red-700">
                          {lineErrors.productId.message}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        aria-invalid={Boolean(lineErrors?.quantity)}
                        {...register(`lines.${index}.quantity`, {
                          valueAsNumber: true,
                        })}
                      />
                      {lineErrors?.quantity && (
                        <p className="text-xs text-red-700">
                          {lineErrors.quantity.message}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <Label>Unit price</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        aria-invalid={Boolean(lineErrors?.unitPrice)}
                        {...register(`lines.${index}.unitPrice`, {
                          valueAsNumber: true,
                        })}
                      />
                      {lineErrors?.unitPrice && (
                        <p className="text-xs text-red-700">
                          {lineErrors.unitPrice.message}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <Label>Discount %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        aria-invalid={Boolean(lineErrors?.discountPercent)}
                        {...register(`lines.${index}.discountPercent`, {
                          valueAsNumber: true,
                        })}
                      />
                      {lineErrors?.discountPercent ? (
                        <p className="text-xs text-red-700">
                          {lineErrors.discountPercent.message}
                        </p>
                      ) : (
                        product && (
                          <p className="text-xs text-muted-foreground">
                            Max {product.maxDiscountPercent}%
                          </p>
                        )
                      )}
                    </div>

                    <div className="col-span-2 flex items-end justify-between gap-2 sm:col-span-2 sm:flex-col sm:items-end">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-muted-foreground">Line total</Label>
                        <p className="h-8 pt-1 text-sm font-medium tabular-nums text-foreground">
                          {linePreview ? formatCurrency(linePreview.lineTotal) : "—"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        disabled={fields.length <= 1}
                        aria-label="Remove line"
                        className="text-muted-foreground hover:text-red-700"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {watchedLines.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No lines yet. Add a product line to get started.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
          <CardDescription>
            Totals are recalculated on the server when the quotation is saved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-sm">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatCurrency(preview.subtotal)}</dd>
            </div>
            <div className="flex items-center justify-between text-sm">
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="tabular-nums text-red-700">
                −{formatCurrency(preview.discountTotal)}
              </dd>
            </div>
            <Separator className="my-1" />
            <div className="flex items-center justify-between text-sm font-medium">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatCurrency(preview.total)}</dd>
            </div>
            <div className="flex items-center justify-between text-sm">
              <dt className="text-muted-foreground">Estimated margin</dt>
              <dd className="tabular-nums">{formatCurrency(preview.margin)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={isSubmitting}
          onClick={() => {
            setPendingAction("save");
            handleSubmit((values) => submit(values, "save"))();
          }}
        >
          <Save className="size-4" aria-hidden />
          Save draft
        </Button>
        <Button
          type="button"
          disabled={isSubmitting}
          onClick={() => {
            setPendingAction("submit");
            handleSubmit((values) => submit(values, "submit"))();
          }}
        >
          {isSubmitting && pendingAction === "submit" ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          Submit quotation
        </Button>
      </div>
    </div>
  );
}