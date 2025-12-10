import { GoogleGenAI } from "@google/genai";
import { TargetFormat } from "../types";

// Initialize the client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Helper to determine MIME type from extension if file.type is missing/generic
 */
const getMimeType = (file: File): string => {
  if (file.type && file.type !== 'application/octet-stream' && file.type !== '') {
    return file.type;
  }
  const ext = file.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'csv': return 'text/csv';
    case 'json': return 'application/json';
    case 'xml': return 'text/xml';
    case 'html': return 'text/html';
    case 'md': return 'text/markdown';
    case 'txt': return 'text/plain';
    case 'doc': 
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'heic': return 'image/heic';
    default: return 'text/plain';
  }
};

/**
 * Checks if a file is safe to be read as text.
 */
const isTextFile = (file: File): boolean => {
  const mimeType = getMimeType(file);
  const textMimes = [
    'text/', 'application/json', 'application/xml', 'application/javascript', 
    'application/x-yaml', 'application/sql', 'application/csv'
  ];
  if (textMimes.some(t => mimeType.startsWith(t))) return true;

  const ext = file.name.split('.').pop()?.toLowerCase();
  const textExts = ['txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js', 'yaml', 'yml', 'sql', 'ts', 'tsx', 'py'];
  return !!ext && textExts.includes(ext);
};

/**
 * Reads a file as text.
 */
const readTextFile = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

/**
 * Converts the file to a Base64 string for the API.
 */
const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (!result) {
        reject(new Error("无法读取文件"));
        return;
      }
      // Remove the Data URL prefix (e.g., "data:image/png;base64,")
      const base64String = result.split(',')[1];
      const mimeType = getMimeType(file);
      resolve({
        inlineData: {
          data: base64String,
          mimeType: mimeType,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Main conversion function using Gemini 2.5 Flash.
 */
export const convertContent = async (
  input: string | File,
  targetFormat: TargetFormat,
  instructions?: string
): Promise<string> => {
  try {
    const modelId = "gemini-2.5-flash"; 

    // Build the request contents
    let parts: any[] = [];
    let promptText = "";
    let isPdfInput = false;

    if (input instanceof File) {
      if (isTextFile(input)) {
        // Optimization: Send text files as raw text to save 33% overhead (Base64)
        const textContent = await readTextFile(input);
        promptText = `Convert the following file content to ${targetFormat}. Filename: ${input.name}\n\nContent:\n${textContent}`;
        parts.push({ text: promptText });
        // Since we already added the content as text, we don't need a separate file part
      } else {
        // Binary files (PDF, Images, DOCX) must use Base64
        const filePart = await fileToGenerativePart(input);
        parts.push(filePart);
        promptText = `Analyze the content of this file and convert it to ${targetFormat}.`;
        
        if (filePart.inlineData.mimeType === 'application/pdf') {
          isPdfInput = true;
        }
      }
    } else {
      promptText = `Convert the following text content to ${targetFormat}:\n\n${input}`;
      parts.push({ text: promptText });
    }

    if (instructions && instructions.trim().length > 0) {
      // If we haven't added prompt text yet (binary file case), or if we are appending to text case
      // Actually, for binary file, parts has [filePart], promptText is separate?
      // No, for generateContent, we pass parts array.
      // If binary: parts=[filePart], we need to add prompt text as another part.
      if (parts.length === 1 && 'inlineData' in parts[0]) {
         // It's a binary file part, add instructions to the prompt text we prepared
         promptText += `\n\nAdditional Instructions & Rules:\n${instructions}`;
         parts.push({ text: promptText });
      } else {
         // It's text input (parts=[{text: ...}]), just append to the existing text part logic? 
         // Actually easier to just add another text part for instructions
         parts.push({ text: `\n\nAdditional Instructions & Rules:\n${instructions}` });
      }
    } else if (parts.length === 1 && 'inlineData' in parts[0]) {
       // Binary file without extra instructions, still need the basic prompt
       parts.push({ text: promptText });
    }

    // Custom system instruction based on target
    let systemInstruction = `You are a strict document conversion engine. 
    Your task is to transform the input data into the requested format (e.g., ${targetFormat}). 
    Do NOT include conversational filler, explanations, or markdown code fences (like \`\`\`json) UNLESS the target format is Markdown. 
    Just output the raw converted content. 
    If the input is an image or PDF, extract all relevant text and data structures and format them accordingly.
    
    IMPORTANT: If the input document contains tables, you MUST preserve the table structure in the target format (e.g., as Markdown tables, HTML <table> tags, CSV rows, or structured JSON arrays). Do not flatten tables into plain text unless requested.`;

    // Special handling for DOCX output: Generates HTML as a proxy for DOCX
    if (targetFormat === TargetFormat.DOCX) {
      systemInstruction += `\n\nFor the target format DOCX (Word), please generate clean, semantic HTML5 code with inline styles suitable for a document. 
      Use <h1>, <h2> for headings, <table> for data, and <p> for text. Do not include <html> or <body> tags, just the content. 
      This HTML will be saved as a .doc file which Word can open.`;
      
      if (isPdfInput) {
        systemInstruction += `\n\nSince the input is a PDF, meticulously extract the text, tables, and document structure. Preserve the flow, hierarchy, and formatting (bold, italics) of the original document in the generated HTML to ensure the converted Word document closely matches the PDF.`;
      }
    }

    const config: any = {
      temperature: 0.2,
      systemInstruction: systemInstruction,
    };

    // Use JSON mode if the target is specifically JSON
    if (targetFormat === TargetFormat.JSON) {
      config.responseMimeType = "application/json";
    }

    const response = await ai.models.generateContent({
      model: modelId,
      contents: { parts },
      config: config,
    });

    return response.text || "未生成任何内容。";
  } catch (error: any) {
    console.error("Conversion error:", error);
    
    // Improved error messaging
    if (error.message?.includes("Rpc failed") || error.toString().includes("413")) {
      throw new Error("文件过大导致网络传输失败。虽然模型很强，但浏览器端传输受限，请尝试压缩 PDF 或使用小于 5MB 的文件。");
    }
    if (error.message?.includes("API_KEY")) {
      throw new Error("API Key 配置无效。");
    }
    
    throw new Error(error.message || "转换内容失败，请重试。");
  }
};