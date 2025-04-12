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

export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [downloadAsZip, setDownloadAsZip] = useState<boolean>(true);
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

    const processingPromises = newPngFiles.map(premultiplyAlpha);
    const results = await Promise.all(processingPromises);

    const successfulResults = results.filter(
      (result): result is ProcessedFile => result !== null
    );

    setProcessedFiles((prevProcessed) => [...prevProcessed, ...successfulResults]);
    setIsProcessing(false);
  }, []);

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

    if (downloadAsZip) {
      const zip = new JSZip();
      processedFiles.forEach((file) => {
        zip.file(file.filename, file.blob);
      });

      try {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        saveAs(zipBlob, "premultiplied_files.zip");
      } catch (error) {
        console.error("Error generating zip file:", error);
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
  }, [processedFiles, downloadAsZip, isDownloadingAll]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 sm:p-12 bg-gray-100">
      <Image
        src="/layerth_logo_gradient.png"
        alt="Layerth Logo"
        width={200}
        height={50}
        className="mb-8"
        priority
      />
      <div className="w-full max-w-lg bg-white p-6 sm:p-8 rounded-lg shadow-md mb-0">
        <h1 className="text-2xl font-bold mb-2 text-center text-gray-800">
          PNG Pre-Multiplier
        </h1>
        <p className="text-sm text-center text-gray-600 mb-6">
          For Blackmagic ATEM Switchers
        </p>
        <div
          className={`relative border-2 border-dashed rounded-lg p-8 sm:p-10 text-center cursor-pointer transition-colors duration-200 ${
            isDragging
              ? "border-blue-600 bg-blue-50"
              : "border-gray-300 hover:border-blue-500"
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
          <p className="text-gray-500 pointer-events-none">
            Drag & drop your PNG files here, or click to select files
          </p>
          {isProcessing && (
            <div className="absolute inset-0 bg-white bg-opacity-80 flex items-center justify-center">
              <p className="text-lg font-semibold text-blue-600">Processing...</p>
            </div>
          )}
        </div>

        {(selectedFiles.length > 0 || processedFiles.length > 0) && (
          <div className="mt-6 space-y-4">
            {selectedFiles.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-2 text-gray-700">
                  Selected Files ({selectedFiles.length}):
                </h2>
                <ul className="list-disc list-inside text-gray-600 max-h-32 overflow-y-auto text-sm space-y-1 bg-gray-50 p-2 rounded">
                  {selectedFiles.map((file, index) => (
                    <li key={index}>{file.name}</li>
                  ))}
                </ul>
              </div>
            )}

            {processedFiles.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-2 text-gray-700">
                  Processed Files ({processedFiles.length}):
                </h2>
                {processedFiles.length > 1 && (
                   <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gray-100 p-3 rounded-md mb-4">
                      <button
                          onClick={handleDownloadAll}
                          disabled={isDownloadingAll}
                          className="flex-grow px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-wait font-medium text-sm"
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
                              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                          />
                          <label 
                              htmlFor="zipCheckbox" 
                              className="text-sm text-gray-700 select-none"
                          >
                              as ZIP
                          </label>
                      </div>
                  </div>
                )}
                <ul className="space-y-2">
                  {processedFiles.map((file, index) => (
                    <li key={index} className="flex justify-between items-center text-sm bg-green-50 p-2 rounded">
                      <span className="text-green-800 truncate pr-2">
                        {file.filename}
                      </span>
                      <a
                        href={file.url}
                        download={file.filename}
                        className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs font-medium whitespace-nowrap"
                      >
                        Download
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={handleClearAll}
              disabled={isProcessing}
              className="mt-4 w-full px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      <footer className="mt-8 text-center">
        <p className="text-xs text-gray-500">
          © {new Date().getFullYear()} Layerth OÜ
        </p>
      </footer>
    </main>
  );
}
