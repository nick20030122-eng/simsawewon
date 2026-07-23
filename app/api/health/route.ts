import { NextResponse } from "next/server";
import { getConfig, getOpenAIKey } from "@/lib/config";

export const runtime = "nodejs";

export function GET() {
  const config = getConfig();
  return NextResponse.json({
    status: "ok",
    openai_configured: getOpenAIKey() !== null,
    model: config.judgeModel,
    ensemble_n: config.ensembleN,
  });
}
