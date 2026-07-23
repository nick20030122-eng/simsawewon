import type { Metadata } from "next";
import { EvaluateClient } from "@/components/evaluate/EvaluateClient";

export const metadata: Metadata = {
  title: "심사 접수 — AI 심사위원",
};

export default function EvaluatePage() {
  return <EvaluateClient />;
}
