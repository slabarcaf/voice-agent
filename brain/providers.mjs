// Each provider streams plain text deltas for (system, messages). Same interface for all,
// so the router can fall back from one to the other without the caller noticing.
import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";

export const PROVIDERS = {
  async *groq({ model, system, messages, maxTokens, env }) {
    const groq = new Groq({ apiKey: env.GROQ_API_KEY });
    const stream = await groq.chat.completions.create({
      model,
      // gpt-oss reasons before answering; its reasoning tokens count against max_tokens.
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low", max_tokens: maxTokens * 4 } : { max_tokens: maxTokens }),
      stream: true,
      messages: [{ role: "system", content: system }, ...messages],
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  },

  async *anthropic({ model, system, messages, maxTokens, env }) {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 });
    const stream = client.beta.messages.stream({
      model,
      max_tokens: maxTokens,
      // Persona + knowledge pack is identical on every call, so cache it.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
      // Short spoken answers: low effort keeps time-to-first-word down.
      output_config: { effort: "low" },
      // Server-side refusal fallback exists for Sonnet/Opus, not Haiku.
      ...(model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }),
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw new Error("anthropic refusal");
  },
};
