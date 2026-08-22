import GenerateWorkbench from '@/components/generate-workbench/GenerateWorkbench';

/**
 * /generate — ourdream-style generation workbench: left console drawer
 * (mode / preset slots / prompt / settings) + companion picker + per-companion
 * works feed. Auth is enforced by the (main) layout route guard.
 */
export default function GeneratePage() {
  return <GenerateWorkbench />;
}
