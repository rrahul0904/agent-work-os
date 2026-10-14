import assert from "node:assert/strict";
import test from "node:test";
import { validateCourse } from "../../../skills/learn-anything/scripts/validate-course.mjs";

function baseCourse() {
  return {
    version: "learn-anything/v1",
    topic: "distributed systems",
    sources: [
      { id: "S01", url: "https://example.org/one", status: "read" },
      { id: "S02", url: "https://docs.example.net/two", status: "read" }
    ],
    lessons: [
      {
        id: "L01",
        title: "Failure is normal",
        citations: ["S01", "S02"],
        agreement: { agree: 2, considered: 2 },
        script: "word ".repeat(260),
        card: {
          idea: "Design for partial failure.",
          impact: "Recovery becomes a first-class behavior.",
          tryIt: "List three dependencies and one failure mode for each.",
          ruleToKeep: "Assume dependencies can fail independently."
        }
      }
    ]
  };
}

test("valid evidence-backed course passes", () => {
  const result = validateCourse(baseCourse());
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.metrics.lessons, 1);
});

test("citation to an unread or unknown source is a hard failure", () => {
  const course = baseCourse();
  course.lessons[0].citations.push("S99");
  const result = validateCourse(course);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /unknown source S99/);
});

test("source concentration over three pages per domain fails", () => {
  const course = baseCourse();
  course.sources = [1, 2, 3, 4].map((n) => ({ id: `S0${n}`, url: `https://example.com/${n}`, status: "read" }));
  course.lessons[0].citations = ["S01", "S02"];
  const result = validateCourse(course);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /maximum is 3/);
});
