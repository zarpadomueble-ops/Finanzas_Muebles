import { describe, expect, it } from "vitest";
import { buildDashboardOverview, buildProfitabilityOverview } from "./analytics";

describe("profitability analytics", () => {
  it("builds dashboard aggregates from real snapshots", () => {
    const result = buildDashboardOverview({
      budgets: [
        {
          id: "b1",
          label: "Vestidor",
          issueDate: "2026-01-15",
          status: "approved",
          total: 100000,
          totalCost: 65000,
          utility: 35000,
          marginPct: 35,
        },
        {
          id: "b2",
          label: "Bajo mesada",
          issueDate: "2026-02-10",
          status: "approved",
          total: 80000,
          totalCost: 50000,
          utility: 30000,
          marginPct: 37.5,
        },
        {
          id: "b3",
          label: "No computa",
          issueDate: "2026-02-11",
          status: "draft",
          total: 50000,
          totalCost: 40000,
          utility: 10000,
          marginPct: 20,
        },
      ],
      materials: [
        {
          id: "m1",
          materialName: "Melamina blanca",
          category: "placas",
          quantity: 2,
          cost: 30000,
        },
        {
          id: "m2",
          materialName: "Bisagra cazoleta",
          category: "herrajes",
          quantity: 8,
          cost: 12000,
        },
        {
          id: "m3",
          materialName: "Melamina blanca",
          category: "placas",
          quantity: 1,
          cost: 15000,
        },
      ],
      jobs: [
        { id: "j1", status: "aprobado", amount: 100000 },
        { id: "j2", status: "en_produccion", amount: 80000 },
        { id: "j3", status: "cobrado", amount: 50000 },
      ],
      cuttingJobs: [
        { id: "c1", status: "optimized", boardsUsed: 3, boardCost: 45000, utilizationPct: 82 },
        { id: "c2", status: "optimized", boardsUsed: 2, boardCost: 28000, utilizationPct: 78 },
        { id: "c3", status: "draft", boardsUsed: 5, boardCost: 60000, utilizationPct: 70 },
      ],
    });

    expect(result.summary.totalSales).toBeCloseTo(180000, 4);
    expect(result.summary.totalCommittedCosts).toBeCloseTo(115000, 4);
    expect(result.summary.totalUtility).toBeCloseTo(65000, 4);
    expect(result.summary.averageMarginPct).toBeCloseTo(36.1111, 4);
    expect(result.summary.activeProjects).toBe(2);
    expect(result.summary.consumedBoards).toBe(5);
    expect(result.summary.boardCost).toBeCloseTo(73000, 4);
    expect(result.summary.averageUtilizationPct).toBeCloseTo(80, 4);
    expect(result.costByCategory[0]).toEqual({ label: "placas", value: 45000 });
    expect(result.topMaterials[0]).toEqual({
      label: "Melamina blanca",
      value: 45000,
      quantity: 3,
    });
    expect(result.salesByMonth).toHaveLength(2);
  });

  it("builds profitability analytics with filters and channel scenarios", () => {
    const result = buildProfitabilityOverview(
      {
        rows: [
          {
            id: "p1",
            source: "project",
            label: "Vestidor premium",
            reference: null,
            category: "Vestidores",
            date: "2026-01-10",
            status: "approved",
            channel: "A medida",
            cost: 60000,
            price: 90000,
            materialCost: 30000,
            laborCost: 20000,
            logisticsCost: 0,
            commercialCost: 10000,
          },
          {
            id: "e1",
            source: "ecommerce",
            label: "Mesa ratona",
            reference: "SKU-100",
            category: "Mesas",
            date: "2026-02-05",
            status: "active",
            channel: "Catalogo",
            cost: 25000,
            price: 42000,
            materialCost: 12000,
            laborCost: 8000,
            logisticsCost: 3000,
            commercialCost: 2000,
          },
        ],
        channelScenarios: [
          {
            id: "s1",
            source: "project",
            label: "Vestidor premium",
            reference: null,
            channel: "a_medida",
            channelLabel: "A medida",
            date: "2026-01-10",
            cost: 60000,
            price: 90000,
          },
          {
            id: "s2",
            source: "ecommerce",
            label: "Mesa ratona",
            reference: "SKU-100",
            channel: "marketplace",
            channelLabel: "Marketplace",
            date: "2026-02-05",
            cost: 29000,
            price: 42000,
          },
          {
            id: "s3",
            source: "ecommerce",
            label: "Mesa ratona",
            reference: "SKU-100",
            channel: "tienda_propia",
            channelLabel: "Tienda propia",
            date: "2026-02-05",
            cost: 27000,
            price: 42000,
          },
        ],
        budgetSnapshots: [
          {
            id: "b1",
            label: "Vestidor premium",
            source: "project",
            issueDate: "2026-01-18",
            total: 90000,
            totalCost: 60000,
          },
        ],
        fixedCosts: 120000,
      },
      {
        search: "mesa",
        source: "ecommerce",
      },
    );

    expect(result.summary.totalRevenue).toBeCloseTo(42000, 4);
    expect(result.summary.totalCost).toBeCloseTo(25000, 4);
    expect(result.summary.totalUtility).toBeCloseTo(17000, 4);
    expect(result.summary.averageMarginPct).toBeCloseTo(40.4762, 4);
    expect(result.summary.projectCount).toBe(0);
    expect(result.summary.ecommerceCount).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.channelMargins).toHaveLength(2);
    expect(result.channelMargins[0]?.channel).toBe("tienda_propia");
    expect(result.monthlyUtility).toHaveLength(0);
    expect(result.breakEvenDefaults.unitPrice).toBeCloseTo(42000, 4);
    expect(result.breakEvenDefaults.unitCost).toBeCloseTo(25000, 4);
    expect(result.breakEvenDefaults.breakEvenUnits).toBe(8);
  });
});
