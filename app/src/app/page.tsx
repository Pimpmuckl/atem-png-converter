"use client";

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  DragEvent,
  ChangeEvent,
  KeyboardEvent,
} from "react";
import Image from "next/image";
import JSZip from "jszip";
import { saveAs } from 'file-saver';

interface ProcessedFile {
  url: string;
  filename: string;
  blob: Blob;
}

const premultiplyAlpha = (file: File): Promise<ProcessedFile | null> => {
  return new Promise((resolve, reject) => {
    createImageBitmap(file, { colorSpaceConversion: 'none' })
      .then((imageBitmap) => {
        const canvas = document.createElement("canvas");
        const width = imageBitmap.width;
        const height = imageBitmap.height;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { colorSpace: "srgb" });

        if (!ctx) {
          console.error("Could not get 2D context");
          imageBitmap.close();
          reject(new Error("Could not get 2D context"));
          return;
        }

        ctx.drawImage(imageBitmap, 0, 0);
        imageBitmap.close();

        try {
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;

          for (let i = 0; i < data.length; i += 4) {
            const origR = data[i];
            const origG = data[i + 1];
            const origB = data[i + 2];
            const alphaByte = data[i + 3];
            const alphaFactor = alphaByte / 255;

            const premultR = Math.floor(origR * alphaFactor);
            const premultG = Math.floor(origG * alphaFactor);
            const premultB = Math.floor(origB * alphaFactor);

            data[i] = premultR;
            data[i + 1] = premultG;
            data[i + 2] = premultB;
            data[i + 3] = alphaByte;
          }
          ctx.putImageData(imageData, 0, 0);

          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const baseName = file.name.substring(0, file.name.lastIndexOf("."));
              const extension = file.name.substring(file.name.lastIndexOf("."));
              const filename = `${baseName}_premult${extension}`;
              resolve({ url, filename, blob });
            } else {
              console.error("Failed to create blob from canvas");
              reject(new Error("Failed to create blob"));
            }
          }, "image/png");
        } catch (error) {
          console.error("Error processing image data:", error);
          reject(error);
        }
      })
      .catch((error) => {
        console.error("Error loading image with createImageBitmap:", error);
        reject(error);
      });
  });
};

// --- TGA CONVERSION FUNCTION ---
const convertToTga = (file: File): Promise<ProcessedFile | null> => {
  return new Promise((resolve, reject) => {
    createImageBitmap(file, { colorSpaceConversion: 'none' })
      .then((imageBitmap) => {
        const width = imageBitmap.width;
        const height = imageBitmap.height;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        // We still draw to canvas to easily get pixel data, srgb context is fine
        const ctx = canvas.getContext("2d", { colorSpace: "srgb" }); 

        if (!ctx) {
          imageBitmap.close();
          reject(new Error("Could not get 2D context for TGA conversion"));
          return;
        }

        ctx.drawImage(imageBitmap, 0, 0);
        imageBitmap.close(); // Done with the bitmap

        try {
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data; // RGBA order

          const tgaHeaderSize = 18;
          const tgaPixelDataSize = width * height * 4;
          const tgaBufferSize = tgaHeaderSize + tgaPixelDataSize;
          const tgaBuffer = new ArrayBuffer(tgaBufferSize);
          const tgaDataView = new DataView(tgaBuffer);

          // --- Create TGA Header (18 bytes) ---
          tgaDataView.setUint8(0, 0); // ID Length (no ID field)
          tgaDataView.setUint8(1, 0); // Color Map Type (no color map)
          tgaDataView.setUint8(2, 2); // Image Type (uncompressed true-color)
          // Color Map Specification (5 bytes - unused, set to 0)
          tgaDataView.setUint16(3, 0, true); // First Entry Index (little-endian)
          tgaDataView.setUint16(5, 0, true); // Color Map Length (little-endian)
          tgaDataView.setUint8(7, 0); // Color Map Entry Size
          // Image Specification (10 bytes)
          tgaDataView.setUint16(8, 0, true); // X Origin (little-endian)
          tgaDataView.setUint16(10, 0, true); // Y Origin (little-endian)
          tgaDataView.setUint16(12, width, true); // Image Width (little-endian)
          tgaDataView.setUint16(14, height, true); // Image Height (little-endian)
          tgaDataView.setUint8(16, 32); // Pixel Depth (32 bits for RGBA)
          // Image Descriptor (1 byte)
          // Bits 0-3: Alpha channel depth (8 bits)
          // Bit 5: Screen origin (0 = bottom-left, 1 = top-left)
          // Set to 0x28 for 8 alpha bits and top-left origin (matches canvas)
          tgaDataView.setUint8(17, 0x28);
          // --- End TGA Header ---

          // --- Write Pixel Data (BGRA order) ---
          let bufferOffset = tgaHeaderSize;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            // --- Pre-multiply RGB values --- 
            const alphaFactor = a / 255;
            const premultR = Math.floor(r * alphaFactor);
            const premultG = Math.floor(g * alphaFactor);
            const premultB = Math.floor(b * alphaFactor);
            // --- End Pre-multiplication ---

            // Write pre-multiplied values in BGRA order
            tgaDataView.setUint8(bufferOffset++, premultB); // Pre-multiplied Blue
            tgaDataView.setUint8(bufferOffset++, premultG); // Pre-multiplied Green
            tgaDataView.setUint8(bufferOffset++, premultR); // Pre-multiplied Red
            tgaDataView.setUint8(bufferOffset++, a);        // Original Alpha
          }
          // --- End Pixel Data ---

          const blob = new Blob([tgaBuffer], { type: 'image/tga' }); // Or application/octet-stream
          const url = URL.createObjectURL(blob);
          const baseName = file.name.substring(0, file.name.lastIndexOf("."));
          const extension = ".tga";
          const filename = `${baseName}${extension}`;
          resolve({ url, filename, blob });

        } catch (error) {
          console.error("Error processing image data for TGA:", error);
          reject(error);
        }
      })
      .catch((error) => {
        console.error("Error loading image with createImageBitmap for TGA:", error);
        reject(error);
      });
  });
};
// --- END TGA CONVERSION FUNCTION ---

export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [downloadAsZip, setDownloadAsZip] = useState<boolean>(true);
  const [outputFormat, setOutputFormat] = useState<'png' | 'tga'>('png');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      processedFiles.forEach((file) => URL.revokeObjectURL(file.url));
    };
  }, [processedFiles]);

  const handleFileProcessing = useCallback(async (incomingFiles: FileList | null) => {
    if (!incomingFiles || incomingFiles.length === 0) return;

    const newPngFiles = Array.from(incomingFiles).filter(
      (file) => file.type === "image/png"
    );

    if (newPngFiles.length === 0) {
        console.log("No new PNG files selected.");
        return;
    }

    setSelectedFiles((prevFiles) => [...prevFiles, ...newPngFiles]);
    setIsProcessing(true);

    // Choose processing function based on outputFormat
    const processingPromises = newPngFiles.map(file => 
      outputFormat === 'png' ? premultiplyAlpha(file) : convertToTga(file)
    );
    
    try {
      const results = await Promise.all(processingPromises);
      const successfulResults = results.filter(
        (result): result is ProcessedFile => result !== null
      );
      setProcessedFiles((prevProcessed) => [...prevProcessed, ...successfulResults]);
    } catch (error) {       
        console.error("Error during file processing pipeline:", error);
        // TODO: Add user feedback for processing errors
    }
    setIsProcessing(false);
  }, [outputFormat]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      handleFileProcessing(event.dataTransfer.files);
    },
    [handleFileProcessing]
  );

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleFileProcessing(event.target.files);
      if (event.target) {
        event.target.value = "";
      }
    },
    [handleFileProcessing]
  );

  const handleDivClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleDivClick();
      }
    },
    [handleDivClick]
  );

  const handleClearAll = useCallback(() => {
    setSelectedFiles([]);
    processedFiles.forEach((file) => URL.revokeObjectURL(file.url));
    setProcessedFiles([]);
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  }, [processedFiles]);

  const handleDownloadAll = useCallback(async () => {
    if (processedFiles.length === 0 || isDownloadingAll) return;
    setIsDownloadingAll(true);
    const zipFilename = outputFormat === 'png' ? "premultiplied_files.zip" : "tga_files.zip";

    if (downloadAsZip) {
      const zip = new JSZip();
      processedFiles.forEach((file) => {
        // Use the blob and filename directly from the processedFiles state
        zip.file(file.filename, file.blob); 
      });
      try {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        saveAs(zipBlob, zipFilename);
      } catch (error) {
        console.error(`Error generating ${zipFilename}:`, error);
      }
    } else {
      processedFiles.forEach((file) => {
         const link = document.createElement('a');
         link.href = file.url;
         link.download = file.filename;
         link.click(); 
      });
    }
    setIsDownloadingAll(false);
  }, [processedFiles, downloadAsZip, isDownloadingAll, outputFormat]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 sm:p-12 bg-gray-100 dark:bg-gray-900">
      <Image
        src="/layerth_logo_gradient.png"
        alt="Layerth Logo"
        width={200}
        height={50}
        className="mb-8"
        priority
      />
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-lg shadow-md mb-0">
        <h1 className="text-2xl font-bold mb-2 text-center text-gray-800 dark:text-gray-100">
          PNG Pre-Multiplier
        </h1>
        <p className="text-sm text-center text-gray-600 dark:text-gray-400 mb-6">
          For Blackmagic ATEM Switchers
        </p>

        {/* Format Toggle Switch */}
        <div className="flex items-center justify-center space-x-2 mb-6">
          <span className={`cursor-pointer px-3 py-1 rounded-l-md text-sm font-medium ${outputFormat === 'png' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'}`}
                onClick={() => setOutputFormat('png')}
          >
            PNG
          </span>
          <span className={`cursor-pointer px-3 py-1 rounded-r-md text-sm font-medium relative ${outputFormat === 'tga' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'}`}
                onClick={() => setOutputFormat('tga')}
          >
            TGA
            <sup className="absolute top-0 right-1 text-xs font-semibold text-orange-500 dark:text-orange-400">β</sup>
          </span>
        </div>

        <div
          className={`relative border-2 border-dashed rounded-lg p-8 sm:p-10 text-center cursor-pointer transition-colors duration-200 ${
            isDragging
              ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-gray-700"
              : "border-gray-300 hover:border-blue-500 dark:border-gray-600 dark:hover:border-blue-400"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleDivClick}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="button"
          aria-label="File upload area"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png"
            className="hidden"
            onChange={handleFileChange}
          />
          <p className="text-gray-500 dark:text-gray-400 pointer-events-none">
            Drag & drop your PNG files here, or click to select files
          </p>
          {isProcessing && (
            <div className="absolute inset-0 bg-white bg-opacity-80 dark:bg-gray-800 dark:bg-opacity-80 flex items-center justify-center rounded-lg">
              <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                Processing...
              </p>
            </div>
          )}
        </div>

        {(selectedFiles.length > 0 || processedFiles.length > 0) && (
          <div className="mt-6 space-y-4">
            {selectedFiles.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-300">
                  Selected Files ({selectedFiles.length}):
                </h2>
                <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 max-h-32 overflow-y-auto text-sm space-y-1 bg-gray-50 dark:bg-gray-700 p-2 rounded">
                  {selectedFiles.map((file, index) => (
                    <li key={index}>{file.name}</li>
                  ))}
                </ul>
              </div>
            )}

            {processedFiles.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-300">
                  {/* Dynamic Title */}
                  {outputFormat === 'png' ? 'Processed Files' : 'Converted Files'} ({processedFiles.length}):
                </h2>
                {processedFiles.length > 1 && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gray-100 dark:bg-gray-700 p-3 rounded-md mb-4">
                    <button
                      onClick={handleDownloadAll}
                      disabled={isDownloadingAll}
                      className="flex-grow px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 disabled:opacity-50 disabled:cursor-wait font-medium text-sm"
                    >
                      {isDownloadingAll ? "Zipping..." : "Download All"}
                    </button>
                    <div className="flex items-center justify-center sm:justify-start space-x-2 flex-shrink-0">
                      <input
                        type="checkbox"
                        id="zipCheckbox"
                        checked={downloadAsZip}
                        onChange={(e) => setDownloadAsZip(e.target.checked)}
                        disabled={isDownloadingAll}
                        className="h-4 w-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 disabled:opacity-50"
                      />
                      <label 
                        htmlFor="zipCheckbox" 
                        className="text-sm text-gray-700 dark:text-gray-300 select-none"
                      >
                        as ZIP
                      </label>
                    </div>
                  </div>
                )}
                <ul className="space-y-2">
                  {processedFiles.map((file, index) => {
                    const extension = file.filename.split('.').pop()?.toUpperCase();
                    const isPng = extension === 'PNG';
                    const isTga = extension === 'TGA';
                    
                    return (
                      <li key={index} className="flex justify-between items-center text-sm bg-green-50 dark:bg-green-900 dark:bg-opacity-50 p-2 rounded">
                        <div className="flex items-center overflow-hidden"> {/* Container for tag + filename */} 
                          {/* Format Tag */}
                          {(isPng || isTga) && (
                            <span 
                              className={`mr-2 px-1.5 py-0.5 rounded text-xs font-semibold uppercase whitespace-nowrap ${ 
                                isPng 
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' 
                                  : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                              }`}
                            >
                              {extension}
                            </span>
                          )}
                          {/* Filename */}
                          <span className="text-green-800 dark:text-green-300 truncate">
                            {file.filename}
                          </span>
                        </div>
                        {/* Download Button */}
                        <a
                          href={file.url}
                          download={file.filename}
                          className="flex-shrink-0 ml-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500 text-xs font-medium whitespace-nowrap"
                        >
                          Download
                        </a>
                      </li>
                    )
                  })}
                </ul>

                {/* Updated Warning Message - Always show when files are processed */}
                <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900 dark:bg-opacity-40 border border-yellow-300 dark:border-yellow-700 rounded-md text-sm text-yellow-800 dark:text-yellow-300">
                  <span className="font-bold">⚠️ Important Note:</span> The generated PNG and TGA files use pre-multiplied alpha specifically formatted for Blackmagic ATEM switchers. They may not display correctly in standard image viewers or other applications and are not standard-compliant file formats in terms of how alpha is handled.
                </div>
              </div>
            )}

            <button
              onClick={handleClearAll}
              disabled={isProcessing}
              className="mt-4 w-full px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      <footer className="mt-8 text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          © {new Date().getFullYear()} Layerth OÜ
        </p>
      </footer>
    </main>
  );
}
