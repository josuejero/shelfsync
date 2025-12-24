/// <reference types="vitest" />

import { render, screen } from "@testing-library/react";

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8000";
});

test("renders the hero title", async () => {
  const { default: Home } = await import("./page");
  render(<Home />);

  expect(screen.getByText("ShelfSync")).toBeInTheDocument();
});
