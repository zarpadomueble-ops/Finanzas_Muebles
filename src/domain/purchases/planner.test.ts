import { describe, expect, it } from "vitest";
import { buildPurchaseOrderCsv } from "./export";
import { buildPurchaseDraft, resolvePurchaseItemStatus, resolvePurchaseStatus } from "./planner";

describe("buildPurchaseDraft", () => {
  it("consolida materiales repetidos por proveedor y material", () => {
    const draft = buildPurchaseDraft([
      {
        materialId: "mat-1",
        supplierId: "sup-1",
        supplierName: "Proveedor Uno",
        description: "Melamina blanca",
        quantity: 2,
        unit: "placa",
        unitCost: 100,
        sourceType: "cut_job",
        sourceId: "cut-1",
      },
      {
        materialId: "mat-1",
        supplierId: "sup-1",
        supplierName: "Proveedor Uno",
        description: "Melamina blanca",
        quantity: 1,
        unit: "placa",
        unitCost: 140,
        sourceType: "cut_job",
        sourceId: "cut-1",
      },
      {
        materialId: "mat-2",
        supplierId: "sup-2",
        supplierName: "Proveedor Dos",
        description: "Canto PVC",
        quantity: 10,
        unit: "m",
        unitCost: 3,
        sourceType: "cut_job",
        sourceId: "cut-1",
      },
    ]);

    expect(draft.items).toHaveLength(2);
    expect(draft.groups).toHaveLength(2);
    expect(draft.items[1]?.quantity ?? draft.items[0].quantity).toBeGreaterThan(0);

    const melamina = draft.items.find((item) => item.materialId === "mat-1");
    expect(melamina?.quantity).toBe(3);
    expect(melamina?.subtotal).toBe(340);
    expect(melamina?.unitCost).toBeCloseTo(113.3333, 4);
    expect(draft.summary.subtotal).toBe(370);
  });
});

describe("purchase status resolution", () => {
  it("marca pendiente, parcial y comprado correctamente", () => {
    expect(resolvePurchaseItemStatus({ quantity: 5, receivedQuantity: 0 })).toBe("pending");
    expect(resolvePurchaseItemStatus({ quantity: 5, receivedQuantity: 2 })).toBe("partial");
    expect(resolvePurchaseItemStatus({ quantity: 5, receivedQuantity: 5 })).toBe("purchased");

    expect(
      resolvePurchaseStatus([
        { quantity: 1, receivedQuantity: 1 },
        { quantity: 2, receivedQuantity: 2 },
      ]),
    ).toBe("purchased");

    expect(
      resolvePurchaseStatus([
        { quantity: 1, receivedQuantity: 0 },
        { quantity: 2, receivedQuantity: 1 },
      ]),
    ).toBe("partial");
  });
});

describe("buildPurchaseOrderCsv", () => {
  it("serializa encabezado e items a CSV", () => {
    const csv = buildPurchaseOrderCsv(
      {
        id: "purchase-1",
        supplierName: "Proveedor Uno",
        sourceLabel: "Proyecto Cocina",
        status: "Pendiente",
        issueDate: "2026-03-12",
        expectedDate: "2026-03-20",
        currency: "ARS",
        notes: "Entregar por la manana",
      },
      [
        {
          description: "Melamina blanca",
          quantity: 2,
          unit: "placa",
          unitCost: 100,
          subtotal: 200,
        },
      ],
    );

    expect(csv).toContain("Proveedor Uno");
    expect(csv).toContain("Proyecto Cocina");
    expect(csv).toContain("Melamina blanca");
    expect(csv).toContain("200");
  });
});
