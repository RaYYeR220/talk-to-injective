import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { model, SYSTEM_PROMPT } from '@/lib/llm';
import { injectiveTools } from '@/lib/injective/tools';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(6),
    tools: injectiveTools,
  });

  return result.toUIMessageStreamResponse();
}
