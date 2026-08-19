/**
 * Generation Progress Log Component
 * 
 * Example of how to integrate detailed logging into ComfyConsole.tsx
 * Shows model selection, endpoint switching, and progress tracking
 */

import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface GenerationLogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  phase: 'routing' | 'submit' | 'polling' | 'finalizing' | 'complete';
  endpointType?: 'flux-primary' | 'sdxl' | 'flux-backup';
  endpointId?: string;
  model?: string;
  steps?: number;
  messages: string[];
  correlationId?: string;
  durationMs?: number;
}

interface GenerationProgressLogProps {
  logs: GenerationLogEntry[];
  activePhase: string | null;
  currentEndpoint: string | null;
  isGenerating: boolean;
  onClearLogs: () => void;
}

export function GenerationProgressLog({
  logs,
  activePhase,
  currentEndpoint,
  isGenerating,
  onClearLogs,
}: GenerationProgressLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'success': return 'text-emerald-400 border-emerald-500/30';
      case 'error': return 'text-red-400 border-red-500/30';
      case 'warn': return 'text-yellow-400 border-yellow-500/30';
      default: return 'text-slate-300 border-slate-600/30';
    }
  };

  const getModelBadge = (endpointType?: string) => {
    switch (endpointType) {
      case 'flux-primary':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">FLUX</Badge>;
      case 'sdxl':
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">SDXL</Badge>;
      case 'flux-backup':
        return <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">FLUX Backup</Badge>;
      default:
        return null;
    }
  };

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  };

  return (
    <Card className="border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-slate-200">Generation Progress</h3>
          {isGenerating && (
            <p className="text-xs text-slate-400 animate-pulse">
              ⏳ Processing... Phase: {activePhase || 'Waiting'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {currentEndpoint && (
            <Badge variant="outline" className="text-xs">
              {getModelBadge(currentEndpoint.split('-')[0])}
              {currentEndpoint !== 'unknown' && ` (${currentEndpoint})`}
            </Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onClearLogs}
            className="h-8 px-2 text-slate-400 hover:text-slate-200"
          >
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={scrollRef}
          className="max-h-80 overflow-y-auto space-y-2 rounded-lg border border-slate-700/30 bg-slate-950/50 p-3 font-mono text-xs"
        >
          {logs.length === 0 ? (
            <p className="text-slate-500 italic">No logs yet. Start generation to see progress...</p>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                className={`rounded border-l-4 p-2 ${getLevelColor(log.level)} ${
                  log.phase === activePhase && isGenerating ? 'animate-pulse bg-white/5' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-[10px] opacity-70 min-w-[70px]">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  
                  {log.correlationId && (
                    <span className="text-[10px] opacity-50 shrink-0">
                      #{log.correlationId.slice(-6)}
                    </span>
                  )}
                  
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      {getModelBadge(log.endpointType)}
                      
                      <span className="font-semibold">
                        {log.phase === 'submit' && '📤 Submitting'}
                        {log.phase === 'polling' && '🔄 Polling'}
                        {log.phase === 'finalizing' && '💾 Finalizing'}
                        {log.phase === 'routing' && '🔀 Routing'}
                        {log.phase === 'complete' && '✅ Complete'}
                        
                        {log.durationMs && ` (${Math.round(log.durationMs / 1000)}s)`}
                      </span>
                    </div>
                    
                    {log.model && (
                      <div className="text-xs opacity-70">
                        Model: <span className="font-mono">{log.model}</span>
                      </div>
                    )}
                    
                    {log.messages.map((msg, i) => (
                      <div key={i} className="opacity-90 pl-2 border-l border-current/20">
                        {msg}
                      </div>
                    ))}
                    
                    {log.endpointId && (
                      <div className="text-[10px] opacity-50 mt-1 break-all">
                        Endpoint: {log.endpointId}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        
        {/* Status Summary */}
        {logs.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-4 text-center">
            <div className="rounded bg-blue-500/10 px-3 py-2">
              <div className="text-lg font-bold text-blue-400">
                {logs.filter(l => l.level === 'info').length}
              </div>
              <div className="text-[10px] text-slate-400">Info</div>
            </div>
            
            {logs.some(l => l.level === 'warn') && (
              <div className="rounded bg-yellow-500/10 px-3 py-2">
                <div className="text-lg font-bold text-yellow-400">
                  {logs.filter(l => l.level === 'warn').length}
                </div>
                <div className="text-[10px] text-slate-400">Warnings</div>
              </div>
            )}
            
            {logs.some(l => l.level === 'error') && (
              <div className="rounded bg-red-500/10 px-3 py-2">
                <div className="text-lg font-bold text-red-400">
                  {logs.filter(l => l.level === 'error').length}
                </div>
                <div className="text-[10px] text-slate-400">Errors</div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Integration Example for Batch Generation in ComfyConsole.tsx
 * 
 * Use this pattern to track generation with detailed logging:
 * 
 * ```typescript
 * const [logs, setLogs] = useState<GenerationLogEntry[]>([]);
 * 
 * const addLog = (entry: Omit<GenerationLogEntry, 'timestamp'>) => {
 *   setLogs(prev => [...prev, { ...entry, timestamp: Date.now() }]);
 * };
 * 
 * // In batch generation loop:
 * await runPodFailoverGenerate(
 *   async () => {
 *     const startTime = Date.now();
 *     addLog({
 *       phase: 'routing',
 *       endpointType: 'flux-primary',
 *       endpointId: process.env.RUNPOD_ENDPOINT_ID,
 *       model: env('RUNPOD_FLUX_CHECKPOINT'),
 *       messages: ['Starting primary FLUX generation attempt'],
 *     });
 *     
 *     const result = await runpodClient.generate(fluxOptions);
 *     
 *     addLog({
 *       phase: 'submit',
 *       endpointType: 'flux-primary',
 *       durationMs: Date.now() - startTime,
 *       messages: [`Submitted successfully`, `Job ID: ${result.job_id}`],
 *       correlationId: result.correlationId,
 *     });
 *     
 *     return result;
 *   },
 *   
 *   async () => {
 *     addLog({
 *       phase: 'routing',
 *       endpointType: 'sdxl',
 *       messages: ['Failed over to SDXL fallback endpoint'],
 *     });
 *     
 *     const startTime = Date.now();
 *     const result = await runpodClient.generate(sdxlOptions);
 *     
 *     addLog({
 *       phase: 'submit',
 *       endpointType: 'sdxl',
 *       durationMs: Date.now() - startTime,
 *       messages: [`SDXL generation completed`, `Used pony/illustrious tags`],
 *       correlationId: result.correlationId,
 *     });
 *     
 *     return result;
 *   },
 *   
 *   async () => {
 *     addLog({
 *       phase: 'routing',
 *       endpointType: 'flux-backup',
 *       messages: ['Falling back to backup FLUX endpoint'],
 *     });
 *     
 *     return await runpodClient.generate(fluxOptions);
 *   }
 * );
 * ```
 */
