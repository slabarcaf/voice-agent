// Cheap EN/ES detector for routing voice and language switches. Returns null when unsure
// (very short or mixed text), so callers keep the current language.
const ES = /\b(el|la|los|las|de|que|en|es|su|para|con|por|una|del|está|también|hola|gracias|qué|cómo|dónde|cuál|cuánto|quién|sí|usted|tiene|hizo|estudió|trabajó|puedes|cuéntame)\b/gi;
const EN = /\b(the|and|is|he|his|for|with|of|to|in|was|has|at|on|also|hi|hello|thanks|what|how|where|which|who|yes|you|did|does|can|tell|about)\b/gi;

export function detectLang(text = "") {
  if (/[¿¡ñ]/i.test(text)) return "es";
  const es = (text.match(ES) || []).length;
  const en = (text.match(EN) || []).length;
  if (es === en) return null;
  return es > en ? "es" : "en";
}
