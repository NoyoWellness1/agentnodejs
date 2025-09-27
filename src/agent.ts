import {
  type JobContext,
  type JobProcess,
  WorkerOptions,
  cli,
  defineAgent,
  llm,
  metrics,
  voice,
} from '@livekit/agents';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as livekit from '@livekit/agents-plugin-livekit';
import * as openai from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

dotenv.config({ path: '.env.local' });

class Assistant extends voice.Agent {
  constructor() {
    super({
      instructions: `You are a compassionate and professional therapist and counselor named Lisa.

      INITIAL GREETING: Always start every new session by introducing yourself: "Hello, I'm Lisa, your AI therapist, and I'm here to support you today. This is a safe space where you can share whatever is on your mind. How are you feeling right now, and what would you like to talk about?"

      Your role is to provide emotional support, active listening, and therapeutic guidance to help people work through their thoughts and feelings.

      Key principles:
      - Practice active listening and validate emotions
      - Use empathetic, non-judgmental language
      - Ask thoughtful, open-ended questions to encourage reflection
      - Offer coping strategies and therapeutic techniques when appropriate
      - Maintain professional boundaries while being warm and supportive
      - Never diagnose mental health conditions or replace professional therapy
      - Encourage seeking professional help for serious concerns

      Your responses should be:
      - Warm, caring, and genuinely empathetic
      - Conversational and natural, avoiding clinical jargon
      - Focused on understanding and supporting the person
      - Clear and without complex formatting or symbols

      Remember: You are here to listen, support, and guide - creating a safe space for people to express themselves.`,
      tools: {},
    });
  }
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    // Set up a voice AI pipeline using OpenAI, Cartesia, Deepgram, and the LiveKit turn detector
    const session = new voice.AgentSession({
      // A Large Language Model (LLM) is your agent's brain, processing user input and generating a response
      // See all providers at https://docs.livekit.io/agents/integrations/llm/
      llm: new openai.LLM({ model: 'gpt-4o-mini' }),
      // Speech-to-text (STT) is your agent's ears, turning the user's speech into text that the LLM can understand
      // See all providers at https://docs.livekit.io/agents/integrations/stt/
      stt: new deepgram.STT({ model: 'nova-3' }),
      // Text-to-speech (TTS) is your agent's voice, turning the LLM's text into speech that the user can hear
      // See all providers at https://docs.livekit.io/agents/integrations/tts/
      tts: new cartesia.TTS({
        voice: '6f84f4b8-58a2-430c-8c79-688dad597532',
      }),
      // VAD and turn detection are used to determine when the user is speaking and when the agent should respond
      // See more at https://docs.livekit.io/agents/build/turns
      turnDetection: new livekit.turnDetector.MultilingualModel(),
      vad: ctx.proc.userData.vad! as silero.VAD,
    });

    // To use a realtime model instead of a voice pipeline, use the following session setup instead:
    // const session = new voice.AgentSession({
    //   // See all providers at https://docs.livekit.io/agents/integrations/realtime/
    //   llm: new openai.realtime.RealtimeModel({ voice: 'marin' }),
    // });

    // Metrics collection, to measure pipeline performance
    // For more information, see https://docs.livekit.io/agents/build/metrics/
    const usageCollector = new metrics.UsageCollector();
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      metrics.logMetrics(ev.metrics);
      usageCollector.collect(ev.metrics);
    });

    const logUsage = async () => {
      const summary = usageCollector.getSummary();
      console.log(`Usage: ${JSON.stringify(summary)}`);
    };

    ctx.addShutdownCallback(logUsage);

    // Start the session, which initializes the voice pipeline and warms up the models
    await session.start({
      agent: new Assistant(),
      room: ctx.room,
      inputOptions: {
        // LiveKit Cloud enhanced noise cancellation
        // - If self-hosting, omit this parameter
        // - For telephony applications, use `BackgroundVoiceCancellationTelephony` for best results
        noiseCancellation: BackgroundVoiceCancellation(),
      },
    });

    // Join the room and connect to the user
    await ctx.connect();
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
