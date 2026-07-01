import { config } from 'dotenv';
import { resolve } from 'path';

// ============================================================
// CRITICAL: Load .env.local BEFORE any framework module loads.
// Static ES imports are hoisted — they execute BEFORE module code.
// Dynamic import() breaks this hoisting, ensuring dotenv runs
// before Next.js/Turbopack compiles any SDK-dependent module.
// ============================================================
config({ path: resolve(process.cwd(), '.env.local') });

// Dynamically import Next.js AFTER dotenv has set process.env
async function bootstrap() {
  const { createServer } = await import('http');
  const { parse } = await import('url');
  const { default: next } = await import('next');

  const dev = process.env.COZE_PROJECT_ENV !== 'PROD';
  const hostname = process.env.HOSTNAME || 'localhost';
  const port = parseInt(process.env.PORT || '5000', 10);

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : process.env.COZE_PROJECT_ENV
      }`,
    );
  });
}

bootstrap().catch(err => {
  console.error('Failed to bootstrap server:', err);
  process.exit(1);
});