import { describe, it, expect } from "vitest";
import { extractJson } from "./json-extractor.js";

describe("extractJson", () => {
  it("extracts JSON from a ```json code fence", () => {
    const text = `Here is the plan:
\`\`\`json
{"summary": "Test plan", "tasks": []}
\`\`\`
That's the plan.`;
    const result = extractJson<{ summary: string; tasks: unknown[] }>(text);
    expect(result).toEqual({ summary: "Test plan", tasks: [] });
  });

  it("extracts JSON from a ``` code fence without language tag", () => {
    const text = `Output:
\`\`\`
{"key": "value"}
\`\`\``;
    const result = extractJson<{ key: string }>(text);
    expect(result).toEqual({ key: "value" });
  });

  it("extracts a raw JSON object from text", () => {
    const text = `The result is {"name": "test", "count": 42} and that's it.`;
    const result = extractJson<{ name: string; count: number }>(text);
    expect(result).toEqual({ name: "test", count: 42 });
  });

  it("extracts a raw JSON array from text", () => {
    const text = `Items: [1, 2, 3]`;
    const result = extractJson<number[]>(text);
    expect(result).toEqual([1, 2, 3]);
  });

  it("handles nested objects", () => {
    const text = `\`\`\`json
{
  "summary": "Plan",
  "tasks": [
    {
      "id": "t1",
      "title": "Do thing",
      "nested": {"deep": true}
    }
  ]
}
\`\`\``;
    const result = extractJson<{ summary: string; tasks: unknown[] }>(text);
    expect(result?.summary).toBe("Plan");
    expect(result?.tasks).toHaveLength(1);
  });

  it("handles strings with escaped quotes", () => {
    const text = '{"message": "He said \\"hello\\""}';
    const result = extractJson<{ message: string }>(text);
    expect(result?.message).toBe('He said "hello"');
  });

  it("handles strings with braces inside", () => {
    const text = '{"code": "function() { return {}; }"}';
    const result = extractJson<{ code: string }>(text);
    expect(result?.code).toBe("function() { return {}; }");
  });

  it("returns null for text with no JSON", () => {
    const text = "This is just plain text with no JSON at all.";
    expect(extractJson(text)).toBeNull();
  });

  it("returns null for invalid JSON in code fence", () => {
    const text = `\`\`\`json
{not valid json}
\`\`\``;
    // Falls through to raw extraction, which also fails
    expect(extractJson(text)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractJson("")).toBeNull();
  });

  it("prefers code fence over raw JSON", () => {
    const text = `{"wrong": true}
\`\`\`json
{"correct": true}
\`\`\``;
    const result = extractJson<{ correct?: boolean; wrong?: boolean }>(text);
    expect(result?.correct).toBe(true);
    expect(result?.wrong).toBeUndefined();
  });

  it("handles unbalanced braces gracefully", () => {
    const text = "{ missing close brace";
    expect(extractJson(text)).toBeNull();
  });
});
