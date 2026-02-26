/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FoundryStatusChip } from "./FoundryStatusChip";

describe("FoundryStatusChip", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders live status label", () => {
    render(<FoundryStatusChip status="live" endpoint="http://foundry.test/run" />);
    expect(screen.getByText("Live Render")).toBeTruthy();
  });

  it("renders dry-run status label", () => {
    render(<FoundryStatusChip status="dry-run" endpoint="http://foundry.test/run" />);
    expect(screen.getByText("Dry-Run")).toBeTruthy();
  });

  it("renders offline status label", () => {
    render(<FoundryStatusChip status="offline" endpoint={null} />);
    expect(screen.getByText("Offline (Static)")).toBeTruthy();
  });

  it("shows endpoint in tooltip title", () => {
    render(<FoundryStatusChip status="live" endpoint="http://foundry.test/run" />);
    const chip = screen.getByText("Live Render").closest("div");
    expect(chip?.getAttribute("title")).toBe(
      "Foundry endpoint: http://foundry.test/run"
    );
  });
});
