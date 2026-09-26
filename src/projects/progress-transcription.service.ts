import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProjectProgressProcessingMode,
  ProjectProgressTranscriptionStatus,
} from '../generated/prisma/client';

@Injectable()
export class ProgressTranscriptionService {
  private readonly logger = new Logger(ProgressTranscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  queue(entryId: string) {
    void this.process(entryId);
  }

  async process(entryId: string) {
    const entry = await this.prisma.projectProgressEntry.findUnique({
      where: { id: entryId },
      select: {
        id: true,
        audioId: true,
        body: true,
        transcript: true,
        processingMode: true,
        transcriptionStatus: true,
      },
    });
    if (!entry?.audioId) {
      return;
    }
    if (
      entry.transcriptionStatus === ProjectProgressTranscriptionStatus.READY &&
      (entry.transcript || entry.body)
    ) {
      return;
    }

    const gatewayToken = this.config.get<string>('AVANEGAR_GATEWAY_TOKEN')?.trim();
    if (!gatewayToken) {
      this.logger.warn('AVANEGAR_GATEWAY_TOKEN is not set; transcription stays pending');
      return;
    }

    await this.prisma.projectProgressEntry.update({
      where: { id: entry.id },
      data: {
        transcriptionStatus: ProjectProgressTranscriptionStatus.PROCESSING,
        transcriptionError: null,
      },
    });

    try {
      const audio = await this.prisma.storedFile.findUnique({
        where: { id: entry.audioId },
      });
      if (!audio) {
        throw new Error('فایل صوتی یافت نشد');
      }

      const transcript = await this.transcribe(gatewayToken, audio);
      const summaryKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
      const summary =
        entry.processingMode === ProjectProgressProcessingMode.DEFERRED && summaryKey
          ? await this.summarize(summaryKey, transcript)
          : null;

      await this.prisma.projectProgressEntry.update({
        where: { id: entry.id },
        data: {
          transcript,
          summary,
          body: entry.body?.trim() ? entry.body : transcript,
          transcriptionStatus: ProjectProgressTranscriptionStatus.READY,
          transcriptionError: null,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'تبدیل صدا به متن ناموفق بود';
      this.logger.error(message);
      await this.prisma.projectProgressEntry.update({
        where: { id: entry.id },
        data: {
          transcriptionStatus: ProjectProgressTranscriptionStatus.FAILED,
          transcriptionError: message.slice(0, 500),
        },
      });
    }
  }

  private async transcribe(
    gatewayToken: string,
    audio: { data: Uint8Array; mimeType: string; originalName: string | null },
  ) {
    const mimeType = audio.mimeType.split(';')[0]?.trim() || 'audio/webm';
    const form = new FormData();
    form.append('model', 'default');
    form.append('srt', 'false');
    form.append('inverseNormalizer', 'false');
    form.append('timestamp', 'false');
    form.append(
      'audio',
      new Blob([Buffer.from(audio.data)], { type: mimeType }),
      audioFileName(mimeType, audio.originalName),
    );
    form.append('spokenPunctuation', 'false');
    form.append('punctuation', 'false');
    form.append('numSpeakers', '0');
    form.append('diarize', 'false');

    const response = await fetch(
      'https://partai.gw.isahab.ir/avanegar/v2/avanegar/request',
      {
        method: 'POST',
        headers: {
          'gateway-token': gatewayToken,
          accept: 'application/json',
        },
        body: form,
      },
    );
    const payload = (await response.json().catch(() => null)) as AvanegarResponse | null;
    const text = payload?.data?.data?.aiResponse?.result?.text?.trim();
    if (!response.ok || !text) {
      const message =
        payload?.data?.data?.aiResponse?.message ||
        payload?.data?.message ||
        payload?.message ||
        'تبدیل صدا به متن ناموفق بود';
      throw new Error(message);
    }
    return text;
  }

  private async summarize(apiKey: string, transcript: string) {
    if (!transcript.trim()) {
      return null;
    }
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'متن صورت‌جلسه یا گزارش پیشرفت پروژه را به فارسی خلاصه کن. کوتاه، مرتب و بدون مقدمه.',
          },
          { role: 'user', content: transcript },
        ],
      }),
    });
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      this.logger.warn(payload.error?.message || 'خلاصه ساخته نشد');
      return null;
    }
    return payload.choices?.[0]?.message?.content?.trim() || null;
  }
}

type AvanegarResponse = {
  message?: string;
  data?: {
    status?: string;
    message?: string;
    data?: {
      aiResponse?: {
        status?: number;
        message?: string;
        result?: { text?: string };
      };
    };
  };
};

function audioFileName(mimeType: string, originalName: string | null) {
  const trimmed = originalName?.trim();
  if (trimmed) {
    return trimmed;
  }
  const ext =
    mimeType === 'audio/mpeg' || mimeType === 'audio/mp3'
      ? 'mp3'
      : mimeType === 'audio/mp4' || mimeType === 'audio/aac' || mimeType === 'audio/x-m4a'
        ? 'm4a'
        : mimeType === 'audio/ogg'
          ? 'ogg'
          : mimeType === 'audio/wav' || mimeType === 'audio/wave'
            ? 'wav'
            : 'webm';
  return `audio.${ext}`;
}
