/**
 * Minimal Telegram Bot API client (fetch-based, no external deps).
 * All methods are fire-and-wait; errors are returned, never thrown.
 */

export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TgChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: Array<{ file_id: string; file_unique_id: string; width: number; height: number }>;
  voice?: { file_id: string; duration: number; mime_type?: string; file_size?: number };
  audio?: { file_id: string; duration: number; mime_type?: string; file_size?: number };
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage & { message_id: number };
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export type InlineKeyboard = InlineKeyboardButton[][];

export class TelegramApi {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private get base(): string {
    return `https://api.telegram.org/bot${this.token}`;
  }

  async call<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 30_000,
  ): Promise<{ ok: boolean; result?: T; description?: string }> {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${this.base}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const data = (await res.json().catch(() => ({}))) as {
        ok: boolean;
        result?: T;
        description?: string;
      };
      return data;
    } catch {
      return { ok: false, description: 'network_error' };
    }
  }

  sendMessage(
    chatId: number,
    text: string,
    opts: { reply_markup?: InlineKeyboard; disable_web_page_preview?: boolean } = {},
  ) {
    // Telegram hard limit: 4096 chars. Caller may pass longer text; truncate.
    const safeText = text.length > 4096 ? `${text.slice(0, 4090)}…` : text;
    return this.call('sendMessage', {
      chat_id: chatId,
      text: safeText,
      disable_web_page_preview: opts.disable_web_page_preview ?? true,
      ...(opts.reply_markup ? { reply_markup: { inline_keyboard: opts.reply_markup } } : {}),
    });
  }

  /** Split long text into multiple messages (AI replies can exceed 4096). */
  async sendLongMessage(chatId: number, text: string, replyMarkup?: InlineKeyboard) {
    const chunks: string[] = [];
    let rest = text;
    while (rest.length > 4096) {
      let cut = rest.lastIndexOf('\n', 4096);
      if (cut < 2000) cut = 4096;
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    chunks.push(rest);
    for (let i = 0; i < chunks.length; i += 1) {
      const isLast = i === chunks.length - 1;
      await this.sendMessage(chatId, chunks[i], {
        reply_markup: isLast ? replyMarkup : undefined,
      });
    }
  }

  sendPhoto(chatId: number, photoUrl: string, caption?: string, replyMarkup?: InlineKeyboard) {
    return this.call('sendPhoto', {
      chat_id: chatId,
      photo: photoUrl,
      ...(caption ? { caption: caption.slice(0, 1024) } : {}),
      ...(replyMarkup ? { reply_markup: { inline_keyboard: replyMarkup } } : {}),
    });
  }

  sendChatAction(chatId: number, action: 'typing' | 'upload_photo') {
    return this.call('sendChatAction', { chat_id: chatId, action }, 8_000);
  }

  editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    replyMarkup?: InlineKeyboard,
  ) {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: text.slice(0, 4096),
      ...(replyMarkup ? { reply_markup: { inline_keyboard: replyMarkup } } : {}),
    });
  }

  answerCallbackQuery(callbackQueryId: string, text?: string) {
    return this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...(text ? { text: text.slice(0, 200) } : {}),
    }, 8_000);
  }

  async getFileUrl(fileId: string): Promise<string | null> {
    const res = await this.call<{ file_path?: string }>('getFile', { file_id: fileId });
    if (!res.ok || !res.result?.file_path) return null;
    return `https://api.telegram.org/file/bot${this.token}/${res.result.file_path}`;
  }
}
