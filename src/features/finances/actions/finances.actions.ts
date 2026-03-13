import {
  financialTransactionsService,
  type FinanceCreateInput,
  type FinanceFormOptions,
  type FinanceListFilters,
} from "@/services/financial-transactions";

export async function listFinancialTransactionRecords(filters: FinanceListFilters) {
  return financialTransactionsService.list(filters);
}

export async function getFinancialFormOptionsRecord(): Promise<FinanceFormOptions> {
  return financialTransactionsService.getFormOptions();
}

export async function createFinancialTransactionRecord(input: FinanceCreateInput) {
  return financialTransactionsService.create(input);
}
