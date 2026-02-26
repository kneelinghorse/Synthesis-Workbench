/// <reference types="vitest" />

import { describe, expect, it } from "vitest"

import { cn } from "./utils"

describe("cn", () => {
  it("merges conflicting Tailwind classes", () => {
    expect(cn("px-2", "px-4", "text-sm")).toBe("px-4 text-sm")
  })

  it("drops falsy values while keeping truthy classes", () => {
    expect(cn("text-sm", false && "hidden", undefined, "font-medium")).toBe(
      "text-sm font-medium"
    )
  })
})
