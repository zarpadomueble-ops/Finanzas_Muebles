import { describe, expect, it } from "vitest";
import { optimizeCuttingJob } from "./engine";

describe("cutting engine", () => {
  it("packs pieces using the minimum number of boards first", () => {
    const result = optimizeCuttingJob({
      params: {
        largoPlacaMm: 1000,
        anchoPlacaMm: 500,
        kerfMm: 0,
        margenPerimetralMm: 0,
        desperdicioExtraPct: 0,
        permitirRotacionDefault: true,
        vetaDefault: false,
      },
      materials: [
        {
          id: "mat-1",
          codigo: "PLA-18",
          nombre: "Melamina blanca",
          unidad: "unidad",
          costoUnitario: 100,
          areaM2: 1.83 * 2.75,
          largoMm: 2750,
          anchoMm: 1830,
          espesorMm: 18,
        },
      ],
      parts: [
        {
          id: "p-1",
          nombrePieza: "Lateral",
          cantidad: 2,
          largoMm: 500,
          anchoMm: 500,
          materialId: "mat-1",
          espesorMm: 18,
          rotacionPermitida: true,
          vetaObligatoria: false,
          cantoRequerido: "",
          prioridad: 3,
          observacion: "",
          bloqueada: false,
        },
      ],
      iteration: 1,
    });

    expect(result.summary.boardsUsed).toBe(1);
    expect(result.summary.piezasUbicadas).toBe(2);
    expect(result.unplaced).toHaveLength(0);
  });

  it("respects grain constraints and does not rotate grain-required parts", () => {
    const result = optimizeCuttingJob({
      params: {
        largoPlacaMm: 500,
        anchoPlacaMm: 300,
        kerfMm: 0,
        margenPerimetralMm: 0,
        desperdicioExtraPct: 0,
        permitirRotacionDefault: true,
        vetaDefault: false,
      },
      materials: [
        {
          id: "mat-1",
          codigo: "PLA",
          nombre: "Placa",
          unidad: "unidad",
          costoUnitario: 100,
          areaM2: null,
          largoMm: null,
          anchoMm: null,
          espesorMm: 18,
        },
      ],
      parts: [
        {
          id: "p-1",
          nombrePieza: "Puerta",
          cantidad: 1,
          largoMm: 300,
          anchoMm: 400,
          materialId: "mat-1",
          espesorMm: 18,
          rotacionPermitida: true,
          vetaObligatoria: true,
          cantoRequerido: "",
          prioridad: 3,
          observacion: "",
          bloqueada: false,
        },
      ],
    });

    expect(result.summary.piezasUbicadas).toBe(0);
    expect(result.unplaced).toHaveLength(1);
    expect(result.unplaced[0]?.reason).toBe("too_large_for_board");
  });

  it("flags parts with missing material as invalid", () => {
    const result = optimizeCuttingJob({
      params: {
        largoPlacaMm: 1000,
        anchoPlacaMm: 500,
        kerfMm: 3,
        margenPerimetralMm: 10,
        desperdicioExtraPct: 0,
        permitirRotacionDefault: true,
        vetaDefault: false,
      },
      materials: [],
      parts: [
        {
          id: "p-1",
          nombrePieza: "Base",
          cantidad: 1,
          largoMm: 700,
          anchoMm: 400,
          materialId: "missing",
          espesorMm: 18,
          rotacionPermitida: true,
          vetaObligatoria: false,
          cantoRequerido: "",
          prioridad: 2,
          observacion: "",
          bloqueada: false,
        },
      ],
    });

    expect(result.summary.piezasUbicadas).toBe(0);
    expect(result.unplaced).toHaveLength(1);
    expect(result.unplaced[0]?.reason).toBe("invalid_material");
  });

  it("calculates total edge meters from canto rules", () => {
    const result = optimizeCuttingJob({
      params: {
        largoPlacaMm: 1000,
        anchoPlacaMm: 1000,
        kerfMm: 0,
        margenPerimetralMm: 0,
        desperdicioExtraPct: 0,
        permitirRotacionDefault: true,
        vetaDefault: false,
      },
      materials: [
        {
          id: "mat-1",
          codigo: "PLA",
          nombre: "Placa",
          unidad: "unidad",
          costoUnitario: 100,
          areaM2: null,
          largoMm: null,
          anchoMm: null,
          espesorMm: 18,
        },
      ],
      parts: [
        {
          id: "p-1",
          nombrePieza: "Tapa",
          cantidad: 1,
          largoMm: 500,
          anchoMm: 300,
          materialId: "mat-1",
          espesorMm: 18,
          rotacionPermitida: true,
          vetaObligatoria: false,
          cantoRequerido: "2l+2a",
          prioridad: 3,
          observacion: "",
          bloqueada: false,
        },
      ],
    });

    expect(result.summary.totalCantoMetros).toBeCloseTo(1.6, 4);
  });
});

