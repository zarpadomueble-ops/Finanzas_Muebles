import { formatCurrency, formatDate } from "@/lib/utils";

export interface BudgetMessageLine {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface BudgetWhatsAppInput {
  budgetNumber?: string | null;
  clientName: string;
  issueDate: string;
  validUntil?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  subtotal: number;
  discountAmount: number;
  total: number;
  deposit: number;
  balance: number;
  lines: BudgetMessageLine[];
}

export function buildBudgetWhatsAppText(input: BudgetWhatsAppInput) {
  const sections = [
    `Presupuesto ${input.budgetNumber ? `#${input.budgetNumber}` : ""}`.trim(),
    `Cliente: ${input.clientName}`,
    `Fecha: ${formatDate(input.issueDate)}`,
    input.validUntil ? `Validez: ${formatDate(input.validUntil)}` : null,
    "",
    "Detalle:",
    ...input.lines.map(
      (line) =>
        `- ${line.description}: ${line.quantity} x ${formatCurrency(line.unitPrice)} = ${formatCurrency(line.total)}`,
    ),
    "",
    `Subtotal: ${formatCurrency(input.subtotal)}`,
    input.discountAmount > 0 ? `Descuento: ${formatCurrency(input.discountAmount)}` : null,
    `Total: ${formatCurrency(input.total)}`,
    `Seña: ${formatCurrency(input.deposit)}`,
    `Saldo: ${formatCurrency(input.balance)}`,
    input.paymentMethod ? `Forma de pago: ${input.paymentMethod}` : null,
    input.notes ? `Notas: ${input.notes}` : null,
  ].filter(Boolean);

  return sections.join("\n");
}
