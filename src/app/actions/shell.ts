"use server";

import { revalidatePath } from "next/cache";
import { getPortfolio } from "@/services/portfolio";
import { setSetting } from "@/services/settings";

export async function setActivePortfolio(portfolioId: string): Promise<void> {
  if (!getPortfolio(portfolioId)) return;
  setSetting("default_portfolio_id", portfolioId);
  revalidatePath("/", "layout");
}
