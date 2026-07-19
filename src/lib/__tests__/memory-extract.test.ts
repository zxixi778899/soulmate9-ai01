import { describe, expect, it } from "vitest";
import { extractMemoriesFallback } from "../memory-extract";

describe("extractMemoriesFallback", () => {
  it("extracts a Chinese preference without an LLM", () => {
    expect(extractMemoriesFallback("我喜欢周末去爬山。")).toEqual([
      expect.objectContaining({ type: "preference", category: "interest" }),
    ]);
  });

  it("extracts an English job fact without an LLM", () => {
    expect(extractMemoriesFallback("I work as a product designer.")).toEqual([
      expect.objectContaining({ type: "fact", category: "work" }),
    ]);
  });

  it("ignores short conversational filler", () => {
    expect(extractMemoriesFallback("好的")).toEqual([]);
  });
});
