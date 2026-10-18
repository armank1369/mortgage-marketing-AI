import { isDatabasePersona } from './workspaceConfiguration.js'

// A chat's explicit generation selection is separate from its original persona
// snapshot and message history. Only resolve IDs in the current workspace list.
export function getChatGenerationPersona(chat, defaultPersona, personas) {
  const original = chat?.persona || defaultPersona
  const id = chat?.generationPersonaId ?? original?.id
  return personas.find((row) => isDatabasePersona(row) && row.id === id) || null
}

export function selectChatGenerationPersona(chats, chatId, personaId, personas) {
  if (personaId !== '' && !personas.some((row) => isDatabasePersona(row) && row.id === personaId)) return chats
  return chats.map((chat) => chat.id === chatId
    ? { ...chat, generationPersonaId: personaId }
    : chat)
}
