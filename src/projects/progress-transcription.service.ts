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

    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY is not set; transcription stays pending');
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

      const transcript = await this.transcribe(apiKey, audio);
      const summary =
        entry.processingMode === ProjectProgressProcessingMode.DEFERRED
          ? await this.summarize(apiKey, transcript)
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
    apiKey: string,
    audio: { data: Uint8Array; mimeType: string; originalName: string | null },
  ) {
    const form = new FormData();
    const name = audio.originalName?.trim() || 'audio.webm';
    form.append(
      'file',
      new Blob([Buffer.from(audio.data)], { type: audio.mimeType }),
      name,
    );
    form.append('model', 'whisper-1');
    form.append('language', 'fa');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const payload = (await response.json()) as { text?: string; error?: { message?: string } };
    if (!response.ok || !payload.text?.trim()) {
      throw new Error(payload.error?.message || 'تبدیل صدا به متن ناموفق بود');
    }
    return payload.text.trim();
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
