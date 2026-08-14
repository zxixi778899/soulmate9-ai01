/**
 * Minimal duck-typed Supabase client surface for site_settings key-value stores.
 *
 * Several stores (ai-modules, comfy-console, model-library, prompt-presets,
 * style-previews, creator-previews, provider-routes) only need to read/write a
 * single JSON value by key in the `site_settings` table. This narrow interface
 * avoids coupling each store to the full generic SupabaseClient type while
 * still accepting any real Supabase client (structural typing).
 */
export interface SiteSettingsQueryError {
  message: string;
  code?: string;
  details?: string;
}

export interface SiteSettingsClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{
          data: { value?: unknown } | null;
          error: SiteSettingsQueryError | null;
        }>;
      };
    };
    upsert: (
      values: Record<string, unknown>,
      options?: { onConflict?: string },
    ) => PromiseLike<{ error: SiteSettingsQueryError | null }>;
  };
}
