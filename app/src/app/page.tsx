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

interface ProcessedFile {
  url: string;
  filename: string;
}

const premultiplyAlpha = (file: File): Promise<ProcessedFile | null> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement("img");
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          console.error("Could not get 2D context");
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0);
        try {
          const imageData = ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );
          const data = imageData.data;

          for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3] / 255;
            data[i] = Math.round(data[i] * alpha); // Red
            data[i + 1] = Math.round(data[i + 1] * alpha); // Green
            data[i + 2] = Math.round(data[i + 2] * alpha); // Blue
            // Alpha remains unchanged
          }
          ctx.putImageData(imageData, 0, 0);

          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const baseName = file.name.substring(
                0,
                file.name.lastIndexOf(".")
              );
              const extension = file.name.substring(
                file.name.lastIndexOf(".")
              );
              const filename = `${baseName}_premult${extension}`;
              resolve({ url, filename });
            } else {
              console.error("Failed to create blob from canvas");
              resolve(null);
            }
          }, "image/png");
        } catch (error) {
          console.error("Error processing image data:", error);
          resolve(null);
        }
      };
      img.onerror = (error) => {
        console.error("Error loading image:", error);
        resolve(null);
      };
      if (e.target?.result && typeof e.target.result === "string") {
        img.src = e.target.result;
      } else {
        console.error("FileReader result is not a string");
        resolve(null);
      }
    };
    reader.onerror = (error) => {
      console.error("Error reading file:", error);
      resolve(null);
    };
    reader.readAsDataURL(file);
  });
};

export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URLs
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
        // TODO: Add better user feedback if non-PNG files are ignored
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
      // Reset input value to allow selecting the same file again
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
    // Revoke existing URLs before clearing
    processedFiles.forEach((file) => URL.revokeObjectURL(file.url));
    setProcessedFiles([]);
    // Ensure file input is cleared if user clicks it next
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  }, [processedFiles]);

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
      <div className="w-full max-w-lg bg-white p-6 sm:p-8 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">
          PNG Pre-Multiplier
        </h1>
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
          tabIndex={0} // Make div focusable
          role="button"
          aria-label="File upload area"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png" // Accept only PNG files
            className="hidden"
            onChange={handleFileChange}
          />
          <p className="text-gray-500 pointer-events-none">
            Drag & drop your PNG files here, or click to select files
          </p>
          {isProcessing && (
            <div className="absolute inset-0 bg-white bg-opacity-80 flex items-center justify-center">
              <p className="text-lg font-semibold text-blue-600">Processing...</p>
              {/* You could add a spinner here */}
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
    </main>
  );
}
