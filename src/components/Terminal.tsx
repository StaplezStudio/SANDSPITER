import React, { useState, useEffect, useRef } from "react";
import { Terminal as TerminalIcon, Maximize2, Minimize2, Trash2 } from "lucide-react";

export function emitLog(message: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') {
  const event = new CustomEvent('terminal:log', { detail: { message, type } });
  window.dispatchEvent(event);
}

export default function Terminal() {
  const [logs, setLogs] = useState<{ id: string, message: string, type: string, timestamp: Date }[]>([
    { id: 'init', message: 'S.A.N.D.S. V2 CLI Initialized.', type: 'info', timestamp: new Date() }
  ]);
  const [isExpanded, setIsExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleLog = (e: Event) => {
      const customEvent = e as CustomEvent;
      setLogs((prev) => [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        ...customEvent.detail,
        timestamp: new Date()
      }]);
    };
    
    window.addEventListener('terminal:log', handleLog);
    return () => window.removeEventListener('terminal:log', handleLog);
  }, []);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isExpanded]);

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800 transition-all duration-300 shadow-2xl ${isExpanded ? 'h-64' : 'h-10'}`}>
      <div 
        className="flex items-center justify-between px-4 h-10 border-b border-slate-800 bg-slate-900/50 cursor-pointer hover:bg-slate-800/50 transition-colors" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-mono font-bold text-slate-300">S.A.N.D.S. Terminal</span>
          {!isExpanded && logs.length > 1 && (
            <span className="ml-2 text-[10px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
              {logs.length - 1} new messages
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button 
            className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-slate-800 transition-colors" 
            onClick={(e) => { e.stopPropagation(); setLogs([]); }}
            title="Clear Terminal"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button 
            className="text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-800 transition-colors" 
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-3 h-[calc(100%-2.5rem)] overflow-y-auto font-mono text-[11px] space-y-1.5 scrollbar-thin">
          {logs.map((log) => (
            <div key={log.id} className="flex gap-3 leading-relaxed">
              <span className="text-slate-600 shrink-0">[{log.timestamp.toLocaleTimeString()}]</span>
              <span className={`${
                log.type === 'error' ? 'text-red-400' :
                log.type === 'warn' ? 'text-amber-400' :
                log.type === 'success' ? 'text-emerald-400' :
                'text-slate-300'
              } break-all`}>
                {log.message}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
