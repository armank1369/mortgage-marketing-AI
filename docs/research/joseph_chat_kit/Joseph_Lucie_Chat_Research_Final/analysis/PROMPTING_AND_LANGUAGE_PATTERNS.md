# Prompting and Language Patterns

This file analyzes **only the user turns contained in the nine approved excerpts**.

## Approved-sample prompt length

There are **17 approved user turns**. Their median length is **4 words**, and **9 of 17** are four words or fewer. This small approved sample should not be generalized to the full unsanitized history, but it does reinforce the context-dependent follow-up pattern visible in J001, J007, J008, and J009.

## Observable patterns

### 1. Compressed follow-ups
J001 includes “NOI” and “Dscr.” J007 uses “Turn off history.” The subject is not restated; the prompt depends on prior context.

### 2. Clarification through a focused second question
J002 asks, “Why does it lead to easier credit if the Fed buys bonds?” after the broader topic has already been established. This suggests an iterative explanation workflow rather than a single fully specified prompt.

### 3. Transformation commands
J008: “Tell me another way.” J009: “To korean.” These prompts specify the operation while leaving the source text implicit in conversation context.

### 4. Professional shorthand
J001 uses NOI, TSR, DSCR, and NOO. This supports the need for domain-aware context handling, but not blind acceptance of ambiguous acronyms. Lucie should preserve context while still surfacing ambiguity when multiple interpretations are plausible.

### 5. Bilingual use
J009 directly requests Korean translation of the preceding warning. This confirms a bilingual task in the approved sample. It does not establish a global language preference.

## Separation from assistant style

The analysis does not treat assistant phrases such as “concise and straight” or claims about what the user “prefers” as evidence. Only Joseph's own approved prompts are used for prompt-pattern findings.
