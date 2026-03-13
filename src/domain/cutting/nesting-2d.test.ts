import { describe, expect, it } from "vitest";
import { nestRectangles2D } from "./nesting-2d";

describe("nestRectangles2D", () => {
  it("expands quantity and packs pieces with first fit decreasing", () => {
    const result = nestRectangles2D({
      board: { widthMm: 1000, heightMm: 500 },
      params: { kerfMm: 0, marginMm: 0 },
      pieces: [
        {
          id: "a",
          nombre: "Lateral",
          widthMm: 500,
          heightMm: 500,
          quantity: 2,
          rotatable: true,
          grainDirectionRequired: false,
          materialGroup: "MEL-18",
        },
      ],
    });

    expect(result.boards).toHaveLength(1);
    expect(result.boards[0]?.placements).toHaveLength(2);
    expect(result.unplaced).toHaveLength(0);
    expect(result.aprovechamientoPct).toBeCloseTo(100, 4);
  });

  it("separates layouts by material group", () => {
    const result = nestRectangles2D({
      board: { widthMm: 1200, heightMm: 600 },
      params: { kerfMm: 0, marginMm: 0 },
      pieces: [
        {
          id: "a",
          nombre: "Pieza A",
          widthMm: 600,
          heightMm: 300,
          quantity: 1,
          rotatable: true,
          grainDirectionRequired: false,
          materialGroup: "MEL-18",
        },
        {
          id: "b",
          nombre: "Pieza B",
          widthMm: 600,
          heightMm: 300,
          quantity: 1,
          rotatable: true,
          grainDirectionRequired: false,
          materialGroup: "MDF-15",
        },
      ],
    });

    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]?.boards).toHaveLength(1);
    expect(result.groups[1]?.boards).toHaveLength(1);
  });

  it("uses rotation when it improves fit and is allowed", () => {
    const result = nestRectangles2D({
      board: { widthMm: 800, heightMm: 600 },
      params: { kerfMm: 0, marginMm: 0 },
      pieces: [
        {
          id: "a",
          nombre: "Tapa",
          widthMm: 500,
          heightMm: 300,
          quantity: 1,
          rotatable: true,
          grainDirectionRequired: false,
          materialGroup: "MEL-18",
        },
        {
          id: "b",
          nombre: "Costado",
          widthMm: 300,
          heightMm: 500,
          quantity: 1,
          rotatable: true,
          grainDirectionRequired: false,
          materialGroup: "MEL-18",
        },
      ],
    });

    expect(result.boards).toHaveLength(1);
    expect(result.boards[0]?.placements.some((placement) => placement.rotated)).toBe(true);
  });

  it("respects grain and marks impossible parts as unplaced", () => {
    const result = nestRectangles2D({
      board: { widthMm: 500, heightMm: 300 },
      params: { kerfMm: 0, marginMm: 0 },
      pieces: [
        {
          id: "a",
          nombre: "Puerta",
          widthMm: 300,
          heightMm: 400,
          quantity: 1,
          rotatable: true,
          grainDirectionRequired: true,
          materialGroup: "MEL-18",
        },
      ],
    });

    expect(result.boards).toHaveLength(0);
    expect(result.unplaced).toHaveLength(1);
    expect(result.unplaced[0]?.reason).toBe("too_large_for_board");
  });

  it("applies margin and kerf when generating free spaces", () => {
    const result = nestRectangles2D({
      board: { widthMm: 1000, heightMm: 1000 },
      params: { kerfMm: 10, marginMm: 20 },
      pieces: [
        {
          id: "a",
          nombre: "Fondo",
          widthMm: 400,
          heightMm: 400,
          quantity: 1,
          rotatable: false,
          grainDirectionRequired: false,
          materialGroup: "MEL-18",
        },
      ],
    });

    const board = result.boards[0];
    expect(board).toBeDefined();
    expect(board?.areaTotalMm2).toBeCloseTo(960 * 960, 3);
    expect(board?.placements[0]?.x).toBe(20);
    expect(board?.placements[0]?.y).toBe(20);
    expect(board?.freeRects.length).toBeGreaterThan(0);
    expect(board?.freeRects.every((rect) => rect.x >= 20 && rect.y >= 20)).toBe(true);
  });
});

