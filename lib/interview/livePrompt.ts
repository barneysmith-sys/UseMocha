export const LIVE_MODEL = "gemini-3.8-live";
export const LIVE_VOICE = "Charon";

export const LIVE_SYSTEM = [
  "Stay completely silent.",
  "Do not greet, explain, describe these instructions, or comment on them.",
  "When the candidate has finished an answer, call submit_candidate_turn with their words and remain silent.",
  "A short pause is not the end of an answer.",
].join(" ");

export function liveSetupMessage() {
  return {
    setup: {
      model: `models/${LIVE_MODEL}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: LIVE_VOICE } },
        },
      },
      systemInstruction: { parts: [{ text: LIVE_SYSTEM }] },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
          endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
          prefixPaddingMs: 300,
          silenceDurationMs: 2000,
        },
        activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
      },
      tools: [
        {
          functionDeclarations: [
            {
              name: "submit_candidate_turn",
              description: "Submit the candidate's completed answer. Call this instead of speaking.",
              behavior: "BLOCKING",
              parameters: {
                type: "object",
                properties: {
                  transcript: {
                    type: "string",
                    description: "Verbatim words the candidate just finished saying.",
                  },
                },
                required: ["transcript"],
              },
            },
          ],
        },
      ],
    },
  };
}
