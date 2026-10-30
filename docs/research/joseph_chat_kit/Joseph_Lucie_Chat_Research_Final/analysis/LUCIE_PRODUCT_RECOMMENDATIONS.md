# Lucie Product Recommendations

These are **testable hypotheses**, not automatic persona settings. They are derived only from the approved J001–J009 evidence.

## 1. Make short contextual follow-ups first-class

**Evidence:** J001, J007, J009.  
**Hypothesis:** Joseph may find Lucie more useful when short turns such as “NOI,” “Dscr,” “Turn off history,” or “To korean” correctly inherit the active context.  
**Test:** Compare a context-preserving flow with a flow that repeatedly asks the user to restate the subject. Measure correction/repetition rate and user preference.

## 2. Add an easy “why / mechanism” depth path

**Evidence:** J002.  
**Hypothesis:** A first answer can stay readable while offering deeper causal explanation when Joseph probes a step.  
**Test:** Provide a concise answer with optional causal expansion; compare satisfaction and follow-up quality against a long all-at-once answer.

## 3. Support one-command transformations

**Evidence:** J008, J009.  
**Hypothesis:** Rephrase/translate operations should work on the immediately preceding content without requiring copy-paste.  
**Test:** Evaluate “another way,” “shorter,” “to Korean,” and similar commands with explicit previews of the transformed text.

## 4. Preserve professional terminology but detect ambiguity

**Evidence:** J001.  
**Hypothesis:** Lucie should retain mortgage shorthand in a professional thread, while asking for clarification only when an acronym is genuinely ambiguous.  
**Test:** Build a benchmark with mortgage abbreviations in-context and out-of-context; score correct expansion, appropriate clarification, and hallucination rate.

## 5. Separate explanation quality from factual verification

**Evidence:** J001–J006 involve professional finance/real-estate topics.  
**Hypothesis:** Lucie can be conversationally useful while clearly distinguishing educational explanation from verified current program, pricing, legal, or compliance information.  
**Test:** Present the same user question with and without source freshness/verification cues and measure whether users correctly understand the status of the information.

## 6. Do not auto-lock a persona from these excerpts

The package does not establish that Joseph prefers a globally concise, verbose, formal, casual, bullet-heavy, or script-like assistant. Use explicit controls or lightweight confirmation before making persistent persona changes.
