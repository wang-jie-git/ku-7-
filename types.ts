
export enum TargetFormat {
  JSON = 'JSON',
  XML = 'XML',
  CSV = 'CSV',
  MARKDOWN = 'Markdown',
  HTML = 'HTML',
  LATEX = 'LaTeX',
  SQL = 'SQL',
  YAML = 'YAML',
  DOCX = 'DOCX (Word文档)',
  PLAIN_TEXT = '纯文本',
  MERMAID = 'Mermaid 图表',
}

export type ConversionStatus = 'idle' | 'processing' | 'success' | 'error';

export interface BatchFileItem {
  id: string;
  file: File;
  status: ConversionStatus;
  result?: string;
  error?: string;
}

export interface ConversionState {
  inputMode: 'text' | 'file';
  inputText: string;
  
  // Batch processing fields
  batchFiles: BatchFileItem[];
  activeFileId: string | null; // ID of the file currently displayed in the output panel
  
  targetFormat: TargetFormat;
  status: ConversionStatus; // Overall status (processing if the queue is running)
  
  // Text mode result
  textResult: string;
  
  error: string | null; // Global error message
  additionalInstructions: string;
  customFilename: string;
}

export const SUPPORTED_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/html',
  'application/json',
  'text/markdown',
  'text/x-yaml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
