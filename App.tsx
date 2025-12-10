
import React, { useState, useRef, useEffect } from 'react';
import { TargetFormat, ConversionState, SUPPORTED_FILE_TYPES, BatchFileItem } from './types';
import { convertContent } from './services/geminiService';
import { 
  FileText, 
  Upload, 
  ArrowRight, 
  Download, 
  Copy, 
  Check, 
  AlertCircle, 
  Loader2, 
  FileCode, 
  X,
  File as FileIcon,
  Trash2,
  RefreshCw,
  Plus
} from 'lucide-react';

const App: React.FC = () => {
  const [state, setState] = useState<ConversionState>({
    inputMode: 'text',
    inputText: '',
    batchFiles: [],
    activeFileId: null,
    targetFormat: TargetFormat.JSON,
    status: 'idle',
    textResult: '',
    error: null,
    additionalInstructions: '',
    customFilename: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  // Expanded accept string to include extensions for better OS file picker support
  const ACCEPT_STRING = [
    ...SUPPORTED_FILE_TYPES,
    '.pdf', '.docx', '.doc', '.csv', '.txt', '.md', '.json', '.xml', '.html', '.yaml', '.yml'
  ].join(',');

  const handleInputModeChange = (mode: 'text' | 'file') => {
    setState(prev => ({ ...prev, inputMode: mode, error: null }));
  };

  // Helper to generate unique IDs
  const generateId = () => Math.random().toString(36).substr(2, 9);

  const processFiles = (files: FileList | File[]) => {
    const newFiles: BatchFileItem[] = [];
    let errorMsg = null;
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB

    Array.from(files).forEach(file => {
      // 1. Size Check
      if (file.size > MAX_SIZE) {
        errorMsg = `文件 ${file.name} 过大 (${(file.size / 1024 / 1024).toFixed(1)}MB)。请上传 5MB 以内的文件。`;
        return;
      }

      // 2. Type Check
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
      const isValidMime = SUPPORTED_FILE_TYPES.some(type => file.type === type || file.type.startsWith(type));
      const isValidExt = ACCEPT_STRING.includes(fileExt);

      if (!isValidMime && !isValidExt && file.type !== '') {
        errorMsg = `不支持的文件类型: ${file.name}`;
        return;
      }

      newFiles.push({
        id: generateId(),
        file: file,
        status: 'idle'
      });
    });

    setState(prev => {
      const updatedFiles = [...prev.batchFiles, ...newFiles];
      return {
        ...prev,
        batchFiles: updatedFiles,
        // If no active file, set the first new one as active
        activeFileId: prev.activeFileId || (newFiles.length > 0 ? newFiles[0].id : prev.activeFileId),
        error: errorMsg || prev.error
      };
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeFile = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setState(prev => {
      const newFiles = prev.batchFiles.filter(f => f.id !== id);
      let newActiveId = prev.activeFileId;
      
      // If we removed the active file, switch to another one
      if (id === prev.activeFileId) {
        newActiveId = newFiles.length > 0 ? newFiles[0].id : null;
      }

      return {
        ...prev,
        batchFiles: newFiles,
        activeFileId: newActiveId
      };
    });
  };

  const handleConvert = async () => {
    // Validation
    if (state.inputMode === 'text' && !state.inputText.trim()) {
      setState(prev => ({ ...prev, error: '请输入需要转换的文本。' }));
      return;
    }
    
    if (state.inputMode === 'file' && state.batchFiles.length === 0) {
      setState(prev => ({ ...prev, error: '请至少选择一个文件。' }));
      return;
    }

    setState(prev => ({ ...prev, status: 'processing', error: null }));

    if (state.inputMode === 'text') {
      try {
        const result = await convertContent(
          state.inputText, 
          state.targetFormat, 
          state.additionalInstructions
        );
        setState(prev => ({ ...prev, status: 'success', textResult: result }));
      } catch (err: any) {
        setState(prev => ({ 
          ...prev, 
          status: 'error', 
          error: err.message || '发生意外错误。' 
        }));
      }
    } else {
      // BATCH MODE: Sequential Processing
      const filesToProcess = state.batchFiles;
      
      for (let i = 0; i < filesToProcess.length; i++) {
        const fileItem = filesToProcess[i];
        
        // Skip already successful files unless we want to re-process (ignoring for now to save API calls)
        if (fileItem.status === 'success') continue;

        // Update current file status to processing
        setState(prev => ({
          ...prev,
          activeFileId: fileItem.id, // Auto switch view to processing file
          batchFiles: prev.batchFiles.map(f => 
            f.id === fileItem.id ? { ...f, status: 'processing', error: undefined } : f
          )
        }));

        try {
          const result = await convertContent(
            fileItem.file,
            state.targetFormat,
            state.additionalInstructions
          );

          // Update success status
          setState(prev => ({
            ...prev,
            batchFiles: prev.batchFiles.map(f => 
              f.id === fileItem.id ? { ...f, status: 'success', result } : f
            )
          }));
        } catch (err: any) {
          // Update error status but continue queue
          setState(prev => ({
            ...prev,
            batchFiles: prev.batchFiles.map(f => 
              f.id === fileItem.id ? { ...f, status: 'error', error: err.message } : f
            )
          }));
        }
      }

      // Final status check
      setState(prev => ({ ...prev, status: 'idle' })); // Queue finished
    }
  };

  // Helper to get currently displayed content
  const getCurrentResult = () => {
    if (state.inputMode === 'text') return state.textResult;
    if (state.activeFileId) {
      const file = state.batchFiles.find(f => f.id === state.activeFileId);
      return file?.result || '';
    }
    return '';
  };

  const handleCopy = () => {
    const content = getCurrentResult();
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const content = getCurrentResult();
    if (!content) return;
    
    let extension = 'txt';
    let mimeType = 'text/plain';

    switch (state.targetFormat) {
      case TargetFormat.JSON: extension = 'json'; mimeType = 'application/json'; break;
      case TargetFormat.CSV: extension = 'csv'; mimeType = 'text/csv'; break;
      case TargetFormat.HTML: extension = 'html'; mimeType = 'text/html'; break;
      case TargetFormat.MARKDOWN: extension = 'md'; mimeType = 'text/markdown'; break;
      case TargetFormat.XML: extension = 'xml'; mimeType = 'text/xml'; break;
      case TargetFormat.SQL: extension = 'sql'; mimeType = 'text/plain'; break;
      case TargetFormat.YAML: extension = 'yaml'; mimeType = 'text/yaml'; break;
      case TargetFormat.DOCX: 
        extension = 'doc'; 
        mimeType = 'application/msword'; 
        break;
    }

    // Determine filename
    let filename = 'convert-result';
    if (state.inputMode === 'text') {
      filename = state.customFilename.trim() || 'text-convert';
    } else if (state.activeFileId) {
      const fileItem = state.batchFiles.find(f => f.id === state.activeFileId);
      if (fileItem) {
        const originalName = fileItem.file.name.substring(0, fileItem.file.name.lastIndexOf('.')) || fileItem.file.name;
        // In batch mode, we ignore customFilename to avoid conflicts, or we could append it. 
        // For safety, let's use original filename + format
        filename = `${originalName}_converted`;
      }
    }

    const safeName = filename.replace(/[^a-z0-9\u4e00-\u9fa5_\-\s]/gi, '_');
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activeFileItem = state.batchFiles.find(f => f.id === state.activeFileId);
  const currentDisplayedResult = getCurrentResult();

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-900 font-sans">
      
      {/* LEFT PANEL: INPUT & CONFIG */}
      <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col gap-6 border-r border-slate-200 bg-white shadow-sm overflow-y-auto h-screen relative">
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-2 shrink-0">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <FileCode size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">UniConvert AI</h1>
            <p className="text-sm text-slate-500 font-medium">万能格式转换专家</p>
          </div>
        </div>

        {/* Input Mode Tabs */}
        <div className="flex p-1 bg-slate-100 rounded-lg w-fit shrink-0">
          <button
            onClick={() => handleInputModeChange('text')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              state.inputMode === 'text' 
                ? 'bg-white text-indigo-700 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            粘贴文本
          </button>
          <button
            onClick={() => handleInputModeChange('file')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              state.inputMode === 'file' 
                ? 'bg-white text-indigo-700 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            批量文件
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-h-[300px] flex flex-col">
          {state.inputMode === 'text' ? (
            <textarea
              className="w-full h-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none font-mono text-sm"
              placeholder="在此粘贴您的内容 (JSON, XML, CSV, 纯文本, 代码...)"
              value={state.inputText}
              onChange={(e) => setState(prev => ({ ...prev, inputText: e.target.value, error: null }))}
            />
          ) : (
            <div className="flex flex-col h-full gap-4">
              {/* File List Area */}
              {state.batchFiles.length > 0 ? (
                <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden flex flex-col bg-slate-50">
                   <div className="p-3 bg-slate-100 border-b border-slate-200 flex justify-between items-center text-xs font-semibold text-slate-500 uppercase">
                      <span>文件列表 ({state.batchFiles.length})</span>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                      >
                        <Plus size={14} /> 添加
                      </button>
                   </div>
                   <div className="overflow-y-auto flex-1 p-2 space-y-2">
                      {state.batchFiles.map(file => (
                        <div 
                          key={file.id}
                          onClick={() => setState(prev => ({ ...prev, activeFileId: file.id }))}
                          className={`p-3 rounded-lg flex items-center justify-between cursor-pointer transition-all border ${
                            state.activeFileId === file.id 
                            ? 'bg-white border-indigo-300 shadow-sm ring-1 ring-indigo-100' 
                            : 'bg-white/50 border-slate-200 hover:border-indigo-200'
                          }`}
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                              file.status === 'success' ? 'bg-green-100 text-green-600' :
                              file.status === 'error' ? 'bg-red-100 text-red-600' :
                              file.status === 'processing' ? 'bg-indigo-100 text-indigo-600' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {file.status === 'success' ? <Check size={16} /> :
                               file.status === 'error' ? <AlertCircle size={16} /> :
                               file.status === 'processing' ? <Loader2 size={16} className="animate-spin" /> :
                               <FileIcon size={16} />}
                            </div>
                            <div className="min-w-0">
                              <p className={`text-sm font-medium truncate ${state.activeFileId === file.id ? 'text-indigo-900' : 'text-slate-700'}`}>
                                {file.file.name}
                              </p>
                              <p className="text-xs text-slate-400">
                                {(file.file.size / 1024).toFixed(0)} KB • {
                                  file.status === 'idle' ? '等待中' : 
                                  file.status === 'processing' ? '处理中...' :
                                  file.status === 'success' ? '完成' : '失败'
                                }
                              </p>
                            </div>
                          </div>
                          <button 
                            onClick={(e) => removeFile(file.id, e)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                   </div>
                </div>
              ) : (
                <div 
                  className="flex-1 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center p-6 hover:border-indigo-400 hover:bg-slate-50 transition-all cursor-pointer"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                    <Upload size={28} />
                  </div>
                  <p className="text-slate-900 font-medium mb-1">点击上传或拖拽文件</p>
                  <p className="text-xs text-slate-500 max-w-[240px] text-center">
                    支持多文件批量处理<br/>
                    PDF, DOCX, 文本, 图片, CSV (最大 5MB)
                  </p>
                </div>
              )}
              
              <input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                onChange={handleFileChange}
                accept={ACCEPT_STRING}
                multiple
              />
            </div>
          )}
        </div>

        {/* Config Area */}
        <div className="space-y-4 shrink-0">
          {/* Target Format */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">目标格式</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.values(TargetFormat).map((format) => (
                <button
                  key={format}
                  onClick={() => setState(prev => ({ ...prev, targetFormat: format }))}
                  className={`px-2 py-2 text-xs sm:text-sm border rounded-lg transition-all text-left truncate ${
                    state.targetFormat === format
                      ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-200'
                      : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>

          {/* Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                {state.inputMode === 'file' ? '文件名 (批量模式使用原名)' : '输出文件名 (可选)'}
              </label>
              <input
                type="text"
                disabled={state.inputMode === 'file'}
                className={`w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm ${
                  state.inputMode === 'file' ? 'opacity-50 cursor-not-allowed text-slate-400' : ''
                }`}
                placeholder={state.inputMode === 'file' ? "自动使用原文件名" : "默认为 'convert-result'"}
                value={state.customFilename}
                onChange={(e) => setState(prev => ({ ...prev, customFilename: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">特殊指令 (可选)</label>
              <input
                type="text"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                placeholder="例如：'保留表格' 或 '只提取数据'"
                value={state.additionalInstructions}
                onChange={(e) => setState(prev => ({ ...prev, additionalInstructions: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="shrink-0 space-y-4">
          {state.error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}

          <button
            onClick={handleConvert}
            disabled={state.status === 'processing'}
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {state.status === 'processing' ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                {state.inputMode === 'file' ? '队列处理中...' : '转换中...'}
              </>
            ) : (
              <>
                {state.inputMode === 'file' && state.batchFiles.some(f => f.status === 'success' || f.status === 'error') ? '重新开始 / 继续' : '开始转换'}
                <ArrowRight size={20} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* RIGHT PANEL: OUTPUT */}
      <div className="w-full md:w-1/2 bg-slate-900 text-slate-100 p-6 md:p-8 flex flex-col h-screen overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6 shrink-0">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">输出结果</span>
            {state.inputMode === 'file' && activeFileItem && (
               <span className="text-sm font-medium text-indigo-400 truncate max-w-[200px] mt-1">
                 {activeFileItem.file.name}
               </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              disabled={!currentDisplayedResult}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              title="复制到剪贴板"
            >
              {copied ? <Check size={20} className="text-green-400" /> : <Copy size={20} />}
            </button>
            <button
              onClick={handleDownload}
              disabled={!currentDisplayedResult}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              title="下载文件"
            >
              <Download size={20} />
            </button>
          </div>
        </div>

        {/* Output Area */}
        <div className="flex-1 relative rounded-xl bg-slate-950/50 border border-slate-800 overflow-hidden shadow-inner">
          {/* Case 1: Active File is Processing */}
          {state.inputMode === 'file' && activeFileItem?.status === 'processing' ? (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-4">
               <Loader2 size={40} className="animate-spin text-indigo-500" />
               <p className="animate-pulse font-medium">正在分析文件...</p>
               <p className="text-xs">文件越大，处理时间越长</p>
             </div>
          ) : 
          /* Case 2: Text Mode Processing */
          state.inputMode === 'text' && state.status === 'processing' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-4">
              <Loader2 size={40} className="animate-spin text-indigo-500" />
              <p className="animate-pulse font-medium">正在转换...</p>
            </div>
          ) :
          /* Case 3: Show Result */
          currentDisplayedResult ? (
            <textarea
              readOnly
              className="w-full h-full p-6 bg-transparent outline-none resize-none font-mono text-sm leading-relaxed text-slate-300 selection:bg-indigo-500/30"
              value={currentDisplayedResult}
            />
          ) :
          /* Case 4: File Error */
          state.inputMode === 'file' && activeFileItem?.status === 'error' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500 gap-4 p-8 text-center">
              <AlertCircle size={40} />
              <p className="font-medium">转换失败</p>
              <p className="text-xs opacity-70">{activeFileItem.error || '未知错误'}</p>
            </div>
          ) :
          /* Case 5: Idle / Empty */
          (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-4 p-8 text-center">
              <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-slate-700 flex items-center justify-center">
                <ArrowRight size={24} className="opacity-50" />
              </div>
              <div>
                <p className="font-medium text-slate-400">准备就绪</p>
                <p className="text-xs mt-1 max-w-[200px] mx-auto opacity-70">
                  {state.inputMode === 'file' ? '选择文件并点击转换。' : '输入文本并选择格式。'}
                </p>
              </div>
            </div>
          )}
        </div>
        
        {/* Footer Info */}
        <div className="mt-4 flex justify-between items-center text-xs text-slate-600 font-mono shrink-0">
          <span>{currentDisplayedResult ? `${currentDisplayedResult.length} 字符` : '0 字符'}</span>
          <span>由 Gemini 2.5 Flash 驱动</span>
        </div>
      </div>
    </div>
  );
};

export default App;
