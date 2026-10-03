import { requireSection } from "@/lib/guard";
import { aiConfigured } from "@/lib/ai-server";
import { AssistantApp } from "./assistant-app";

export const dynamic = "force-dynamic"; // reads OPENAI_API_KEY at request time

export default async function Page() {
  await requireSection("ai");
  return <AssistantApp configured={aiConfigured()} />;
}
