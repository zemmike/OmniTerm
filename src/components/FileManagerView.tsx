import React, { useState, useEffect } from 'react';
import {
  FolderTree,
  FileCode,
  FileText,
  Save,
  Plus,
  Trash2,
  Lock,
  Search,
  CheckCircle,
  AlertCircle,
  Code2,
  Eye,
  Edit3,
} from 'lucide-react';
import { FileItem, UserRole } from '../types';

interface FileManagerViewProps {
  userRole: UserRole;
}

export const FileManagerView: React.FC<FileManagerViewProps> = ({ userRole }) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [editorContent, setEditorContent] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // New File Modal
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFilePath, setNewFilePath] = useState('/home/user/script.sh');
  const [newFileContent, setNewFileContent] = useState('#!/bin/bash\necho "Hello DevTerminal"');

  // Fetch virtual files from server
  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      setFiles(data);
      if (data.length > 0 && !selectedFile) {
        setSelectedFile(data[0]);
        setEditorContent(data[0].content || '');
      }
    } catch (err) {
      console.error('Failed to load files:', err);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleSelectFile = (file: FileItem) => {
    setSelectedFile(file);
    setEditorContent(file.content || '');
    setSaveSuccess(false);
    setSaveError(null);
  };

  const handleSaveFile = async () => {
    if (!selectedFile) return;

    if (userRole === 'viewer') {
      setSaveError('Permission Denied: Viewer role cannot modify system files.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await fetch('/api/files/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: selectedFile.path,
          content: editorContent,
          userRole,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        fetchFiles();
      } else {
        setSaveError(data.error || 'Failed to save file.');
      }
    } catch (err: any) {
      setSaveError(err.message || 'Error communicating with server.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateFile = async () => {
    if (!newFilePath) return;

    setIsSaving(true);
    try {
      const res = await fetch('/api/files/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: newFilePath,
          content: newFileContent,
          userRole,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowNewFileModal(false);
        fetchFiles();
      }
    } catch (err) {
      console.error('Error creating file:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredFiles = files.filter(
    (f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-125px)] bg-[#0F0F10] text-[#E0E0E5] font-mono text-xs">
      {/* File Explorer Sidebar */}
      <div className="w-full md:w-80 bg-[#161618] border-r border-[#2A2A2E] flex flex-col">
        <div className="p-3 border-b border-[#2A2A2E] space-y-2">
          <div className="flex items-center justify-between font-bold text-[#E0E0E5]">
            <span className="flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-[#00FF41]" />
              <span>SYSTEM FILESYSTEM</span>
            </span>
            <button
              onClick={() => setShowNewFileModal(true)}
              disabled={userRole === 'viewer'}
              className="px-2 py-1 bg-[#00FF41] hover:bg-[#00D035] disabled:opacity-40 text-black font-bold uppercase rounded flex items-center gap-1 transition-colors"
              title="Create New File"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#55555E]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search path or filename..."
              className="w-full bg-[#0A0A0B] border border-[#2A2A2E] rounded px-2.5 py-1 pl-8 text-xs text-[#E0E0E5] focus:outline-none focus:border-[#00FF41] font-mono"
            />
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredFiles.map((file) => {
            const isSelected = selectedFile?.id === file.id;
            return (
              <div
                key={file.id}
                onClick={() => handleSelectFile(file)}
                className={`p-2.5 rounded border cursor-pointer transition-all flex items-center justify-between ${
                  isSelected
                    ? 'bg-[#202024] border-[#2A2A2E] border-l-2 border-l-[#00FF41] text-[#00FF41] font-bold'
                    : 'bg-[#161618] border-[#2A2A2E]/60 hover:bg-[#202024] text-[#88888E]'
                }`}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <FileCode className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[#00FF41]' : 'text-[#55555E]'}`} />
                  <div className="truncate">
                    <div className="font-mono text-xs font-bold">{file.name}</div>
                    <div className="text-[10px] text-[#55555E] truncate">{file.path}</div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[10px] font-mono text-[#88888E]">{file.permissions}</div>
                  <div className="text-[10px] text-[#55555E]">{file.size} B</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Editor & Viewport Workspace */}
      <div className="flex-1 flex flex-col bg-[#0A0A0B] overflow-hidden">
        {selectedFile ? (
          <>
            {/* Editor Header Bar */}
            <div className="bg-[#161618] border-b border-[#2A2A2E] p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#00FF41]" />
                <span className="font-mono font-bold text-[#E0E0E5]">{selectedFile.path}</span>
                <span className="px-2 py-0.5 rounded bg-[#202024] border border-[#2A2A2E] text-[10px] font-mono text-[#88888E] uppercase">
                  {selectedFile.language || 'text'}
                </span>
                <span className="text-[10px] text-[#55555E] font-mono">Owner: {selectedFile.owner}</span>
              </div>

              <div className="flex items-center gap-2">
                {userRole === 'viewer' ? (
                  <div className="px-2.5 py-1 rounded bg-[#FFBD2E]/10 border border-[#FFBD2E]/30 text-[#FFBD2E] flex items-center gap-1.5 text-xs">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Read-Only Mode</span>
                  </div>
                ) : (
                  <button
                    onClick={handleSaveFile}
                    disabled={isSaving}
                    className="px-3 py-1.5 rounded bg-[#00FF41] hover:bg-[#00D035] text-black font-bold uppercase text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Saving...' : 'Save File'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Notification Banner */}
            {saveSuccess && (
              <div className="bg-[#00FF41]/10 border-b border-[#00FF41]/30 text-[#00FF41] px-4 py-2 flex items-center gap-2 text-xs">
                <CheckCircle className="w-4 h-4 text-[#00FF41]" />
                <span>File saved successfully to virtual filesystem!</span>
              </div>
            )}

            {saveError && (
              <div className="bg-[#FF5555]/10 border-b border-[#FF5555]/30 text-[#FF5555] px-4 py-2 flex items-center gap-2 text-xs">
                <AlertCircle className="w-4 h-4 text-[#FF5555]" />
                <span>{saveError}</span>
              </div>
            )}

            {/* Code Editor */}
            <div className="flex-1 flex font-mono text-xs overflow-hidden bg-[#0A0A0B]">
              {/* Line Numbers */}
              <div className="w-10 bg-[#161618] border-r border-[#2A2A2E] py-3 text-right pr-2 text-[#55555E] select-none">
                {editorContent.split('\n').map((_, idx) => (
                  <div key={idx} className="leading-relaxed">{idx + 1}</div>
                ))}
              </div>

              {/* Text Area */}
              <textarea
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                readOnly={userRole === 'viewer'}
                className="flex-1 bg-[#0A0A0B] p-3 text-[#00FF41] focus:outline-none resize-none leading-relaxed font-mono"
                spellCheck={false}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-[#88888E] space-y-2">
            <Code2 className="w-12 h-12 text-[#55555E]" />
            <p>Select a system file from the explorer to view or edit</p>
          </div>
        )}
      </div>

      {/* New File Modal */}
      {showNewFileModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-mono">
          <div className="bg-[#161618] border border-[#2A2A2E] rounded max-w-md w-full p-4 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
              <span className="font-bold text-[#E0E0E5] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#00FF41]" />
                <span>CREATE SYSTEM FILE</span>
              </span>
              <button
                onClick={() => setShowNewFileModal(false)}
                className="text-[#55555E] hover:text-[#E0E0E5]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#88888E] mb-1 font-bold">Absolute File Path</label>
                <input
                  type="text"
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  placeholder="/var/scripts/myscript.sh"
                  className="w-full bg-[#0A0A0B] border border-[#2A2A2E] rounded px-3 py-1.5 text-[#E0E0E5] font-mono focus:outline-none focus:border-[#00FF41]"
                />
              </div>

              <div>
                <label className="block text-[#88888E] mb-1 font-bold">Initial File Content</label>
                <textarea
                  value={newFileContent}
                  onChange={(e) => setNewFileContent(e.target.value)}
                  rows={6}
                  className="w-full bg-[#0A0A0B] border border-[#2A2A2E] rounded p-2 text-[#00FF41] font-mono focus:outline-none focus:border-[#00FF41]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#2A2A2E]">
              <button
                onClick={() => setShowNewFileModal(false)}
                className="px-3 py-1.5 rounded bg-[#202024] hover:bg-[#2A2A2E] text-[#88888E] text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFile}
                className="px-3 py-1.5 rounded bg-[#00FF41] hover:bg-[#00D035] font-bold text-black uppercase text-xs"
              >
                Create File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
