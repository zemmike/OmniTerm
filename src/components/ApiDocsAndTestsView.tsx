import React, { useState, useEffect } from 'react';
import {
  FileCode2,
  CheckCircle2,
  XCircle,
  Play,
  Clock,
  RefreshCw,
  Code2,
  Send,
  Layers,
} from 'lucide-react';
import { TestCase } from '../types';

export const ApiDocsAndTestsView: React.FC = () => {
  const [tests, setTests] = useState<TestCase[]>([]);
  const [testSummary, setTestSummary] = useState<{
    passedCount: number;
    failedCount: number;
    totalCount: number;
    totalDurationMs: number;
  } | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);

  const [apiDocs, setApiDocs] = useState<any>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('/api/health');
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleRunUnitTests = async () => {
    setIsRunningTests(true);
    try {
      const res = await fetch('/api/unit-tests/run', { method: 'POST' });
      const data = await res.json();
      setTests(data.tests);
      setTestSummary({
        passedCount: data.passedCount,
        failedCount: data.failedCount,
        totalCount: data.totalCount,
        totalDurationMs: data.totalDurationMs,
      });
    } catch (err) {
      console.error('Failed to run unit tests:', err);
    } finally {
      setIsRunningTests(false);
    }
  };

  const fetchApiDocs = async () => {
    try {
      const res = await fetch('/api/api-docs');
      const data = await res.json();
      setApiDocs(data);
    } catch (err) {
      console.error('Failed to load API docs:', err);
    }
  };

  useEffect(() => {
    handleRunUnitTests();
    fetchApiDocs();
  }, []);

  const handleTestApiCall = async (endpoint: string) => {
    setSelectedEndpoint(endpoint);
    try {
      const res = await fetch(endpoint, {
        method: endpoint === '/api/terminal/execute' ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: endpoint === '/api/terminal/execute' ? JSON.stringify({ command: 'help' }) : undefined,
      });
      const data = await res.json();
      setTestResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setTestResult(`[API Call Error]: ${err.message}`);
    }
  };

  return (
    <div className="p-4 sm:p-6 bg-[#0F0F10] text-[#E0E0E5] font-mono min-h-[calc(100vh-125px)] space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-4">
        <div>
          <h1 className="text-lg font-bold text-[#E0E0E5] flex items-center gap-2">
            <FileCode2 className="w-5 h-5 text-[#00FF41]" />
            <span>UNIT TESTING SUITES & INTERACTIVE API DOCUMENTATION</span>
          </h1>
          <p className="text-xs text-[#88888E]">
            Automated quality assurance unit tests and comprehensive OpenAPI specifications.
          </p>
        </div>
      </div>

      {/* Unit Testing Suite Runner */}
      <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
          <div className="flex items-center gap-3">
            <span className="font-bold text-xs text-[#E0E0E5] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#00FF41]" />
              <span>UNIT TESTING SUITE EXECUTION SUITE</span>
            </span>
            {testSummary && (
              <span className="px-2 py-0.5 rounded bg-[#00FF41]/10 text-[#00FF41] border border-[#00FF41]/30 text-[11px] font-mono font-bold">
                {testSummary.passedCount} / {testSummary.totalCount} Passed ({testSummary.totalDurationMs}ms)
              </span>
            )}
          </div>

          <button
            onClick={handleRunUnitTests}
            disabled={isRunningTests}
            className="px-3 py-1.5 rounded bg-[#00FF41] hover:bg-[#00D035] disabled:opacity-40 text-black font-bold uppercase text-xs flex items-center gap-1.5 transition-colors"
          >
            <Play className={`w-3.5 h-3.5 fill-black text-black ${isRunningTests ? 'animate-spin' : ''}`} />
            <span>{isRunningTests ? 'Running Suites...' : 'Run Unit Test Suite'}</span>
          </button>
        </div>

        {/* Test Cases Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs text-[#E0E0E5]">
            <thead>
              <tr className="border-b border-[#2A2A2E] text-[11px] text-[#55555E] uppercase">
                <th className="py-2 px-3">Suite Name</th>
                <th className="py-2 px-3">Test Spec</th>
                <th className="py-2 px-3">Duration</th>
                <th className="py-2 px-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2A2E]/60">
              {tests.map((test) => (
                <tr key={test.id} className="hover:bg-[#202024]">
                  <td className="py-2 px-3 font-bold text-[#3B82F6]">{test.suite}</td>
                  <td className="py-2 px-3 text-[#E0E0E5]">{test.name}</td>
                  <td className="py-2 px-3 text-[#55555E]">{test.durationMs}ms</td>
                  <td className="py-2 px-3 text-right">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#00FF41]/10 text-[#00FF41] border border-[#00FF41]/30">
                      <CheckCircle2 className="w-3 h-3 text-[#00FF41]" />
                      <span>{test.status}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive REST API Documentation */}
      <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-4">
        <div className="border-b border-[#2A2A2E] pb-2">
          <h3 className="font-bold text-xs text-[#E0E0E5] flex items-center gap-2">
            <Code2 className="w-4 h-4 text-[#BB86FC]" />
            <span>INTERACTIVE REST API DOCUMENTATION (OPENAPI v3.0)</span>
          </h3>
        </div>

        {apiDocs && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#88888E] uppercase">Available Endpoints:</div>
              <div className="space-y-2">
                {Object.entries(apiDocs.paths).map(([path, methods]: any) => {
                  const method = Object.keys(methods)[0].toUpperCase();
                  const info = methods[Object.keys(methods)[0]];
                  return (
                    <div
                      key={path}
                      onClick={() => handleTestApiCall(path)}
                      className={`p-3 rounded border cursor-pointer transition-all flex items-center justify-between ${
                        selectedEndpoint === path
                          ? 'bg-[#202024] border-[#2A2A2E] border-l-2 border-l-[#00FF41] text-[#00FF41]'
                          : 'bg-[#0A0A0B] border-[#2A2A2E] hover:bg-[#202024] text-[#E0E0E5]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            method === 'GET' ? 'bg-[#00FF41]/10 text-[#00FF41] border border-[#00FF41]/30' : 'bg-[#BB86FC]/10 text-[#BB86FC] border border-[#BB86FC]/30'
                          }`}
                        >
                          {method}
                        </span>
                        <span className="font-mono text-xs font-bold">{path}</span>
                      </div>
                      <span className="text-[11px] text-[#88888E]">{info.summary}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Test Endpoint Response */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#88888E] flex items-center justify-between uppercase">
                <span>Response for <span className="text-[#BB86FC] font-mono">{selectedEndpoint}</span>:</span>
              </div>
              <pre className="p-3 rounded bg-[#0A0A0B] border border-[#2A2A2E] text-xs font-mono text-[#00FF41] overflow-x-auto max-h-80 whitespace-pre-wrap">
                {testResult || '// Click an endpoint to send a test query...'}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
