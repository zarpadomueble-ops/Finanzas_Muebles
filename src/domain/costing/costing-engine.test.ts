import { describe, expect, it } from "vitest";
import { calculateBudgetSummary } from "./budgets";
import { calculateCustomProjectCost } from "./custom-project";
import { calculateEcommerceProductCost } from "./ecommerce-product";
import {
  calculateBreakEvenPoint,
  calculateMaterialsSubtotal,
  calculateSuggestedPriceByMargin,
} from "./engine";

describe("costing engine", () => {
  it("calculates materials subtotal with line and global waste", () => {
    const result = calculateMaterialsSubtotal(
      [
        { quantity: 2, unitCost: 100, wastePct: 10 },
        { quantity: 1, unitCost: 50 },
      ],
      { globalWastePct: 5 },
    );

    expect(result.baseSubtotal).toBeCloseTo(250, 4);
    expect(result.wasteSubtotal).toBeCloseTo(33.5, 4);
    expect(result.subtotal).toBeCloseTo(283.5, 4);
  });

  it("calculates custom project cost with commercial charges", () => {
    const result = calculateCustomProjectCost({
      settings: {
        horasProductivasMes: 176,
        costosFijosMes: 100000,
        costoHoraTaller: 10,
        desperdicioMelaminaPct: 0,
        margenMedidaPct: 30,
        margenEcommercePct: 25,
        impuestosPct: 10,
        publicidadPct: 5,
        comisionCobroPct: 0,
        embalajePromedio: 0,
        envioPromedio: 0,
      },
      materials: [{ quantity: 3, unitCost: 100 }],
      labor: [{ hours: 2 }],
    });

    expect(result.subtotalMateriales).toBeCloseTo(300, 4);
    expect(result.horasTotales).toBeCloseTo(2, 4);
    expect(result.costoManoObra).toBeCloseTo(20, 4);
    expect(result.costoDirecto).toBeCloseTo(320, 4);
    expect(result.costoCargosComerciales).toBeCloseTo(48, 4);
    expect(result.costoTotal).toBeCloseTo(368, 4);
    expect(result.precioSugerido).toBeCloseTo(525.7143, 4);
    expect(result.utilidad).toBeCloseTo(157.7143, 4);
    expect(result.margenRealPct).toBeCloseTo(30, 4);
  });

  it("supports target price override in custom project", () => {
    const result = calculateCustomProjectCost({
      settings: {
        horasProductivasMes: 176,
        costosFijosMes: 100000,
        costoHoraTaller: 10,
        desperdicioMelaminaPct: 0,
        margenMedidaPct: 30,
        margenEcommercePct: 25,
        impuestosPct: 0,
        publicidadPct: 0,
        comisionCobroPct: 0,
        embalajePromedio: 0,
        envioPromedio: 0,
      },
      materials: [{ quantity: 1, unitCost: 200 }],
      labor: [{ hours: 5 }],
      targetPrice: 400,
    });

    expect(result.costoTotal).toBeCloseTo(250, 4);
    expect(result.precioEvaluado).toBeCloseTo(400, 4);
    expect(result.utilidad).toBeCloseTo(150, 4);
    expect(result.margenRealPct).toBeCloseTo(37.5, 4);
  });

  it("calculates ecommerce product cost separated from custom margin", () => {
    const result = calculateEcommerceProductCost({
      settings: {
        horasProductivasMes: 176,
        costosFijosMes: 100000,
        costoHoraTaller: 10,
        desperdicioMelaminaPct: 10,
        margenMedidaPct: 30,
        margenEcommercePct: 25,
        impuestosPct: 0,
        publicidadPct: 0,
        comisionCobroPct: 0,
        embalajePromedio: 20,
        envioPromedio: 10,
      },
      materials: [{ quantity: 1, unitCost: 100 }],
      labor: [{ hours: 1 }],
      packagingUnitCost: 5,
      shippingUnitCost: 2,
      marketPrice: 250,
    });

    expect(result.costoMaterialesUnit).toBeCloseTo(110, 4);
    expect(result.costoManoObraUnit).toBeCloseTo(10, 4);
    expect(result.costoDirectoUnit).toBeCloseTo(120, 4);
    expect(result.costoLogisticaUnit).toBeCloseTo(37, 4);
    expect(result.costoTotalUnit).toBeCloseTo(157, 4);
    expect(result.precioSugerido).toBeCloseTo(209.3333, 4);
    expect(result.utilidadUnit).toBeCloseTo(93, 4);
  });

  it("calculates suggested price and break-even correctly", () => {
    expect(calculateSuggestedPriceByMargin(500, 20)).toBeCloseTo(625, 4);

    const breakEven = calculateBreakEvenPoint({
      fixedCosts: 120000,
      unitPrice: 1000,
      unitCost: 700,
    });
    expect(breakEven.contributionMarginPerUnit).toBeCloseTo(300, 4);
    expect(breakEven.breakEvenUnits).toBe(400);
    expect(breakEven.breakEvenRevenue).toBeCloseTo(400000, 4);

    const impossible = calculateBreakEvenPoint({
      fixedCosts: 50000,
      unitPrice: 500,
      unitCost: 500,
    });
    expect(impossible.breakEvenUnits).toBeNull();
    expect(impossible.breakEvenRevenue).toBeNull();
  });

  it("builds budget summary totals", () => {
    const summary = calculateBudgetSummary({
      lines: [
        { concepto: "fabricacion", descripcion: "Fabricacion", precioUnitario: 200000 },
        { concepto: "instalacion", descripcion: "Instalacion", precioUnitario: 30000 },
        { concepto: "descuento", descripcion: "Descuento", precioUnitario: -10000 },
      ],
      senia: 50000,
    });

    expect(summary.total).toBeCloseTo(220000, 4);
    expect(summary.senia).toBeCloseTo(50000, 4);
    expect(summary.saldo).toBeCloseTo(170000, 4);
  });
});
