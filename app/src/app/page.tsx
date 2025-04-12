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
            const pixelIndex = i / 4;
            const x = pixelIndex % width;
            const y = Math.floor(pixelIndex / width);

            const origR = data[i];
            const origG = data[i + 1];
            const origB = data[i + 2];
            const alphaByte = data[i + 3];
            const alphaFactor = alphaByte / 255;

            const premultR = Math.floor(origR * alphaFactor);
            const premultG = Math.floor(origG * alphaFactor);
            const premultB = Math.floor(origB * alphaFactor);

            if (x === 746 && y === 50) {
              console.log(`DEBUG Pixel (${x}, ${y}) using createImageBitmap:`, {
                origR,
                origG,
                origB,
                alphaByte,
              });
            }

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
              resolve({ url, filename });
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

const getImageDataFromFile = (file: File): Promise<ImageData | null> => {
  return new Promise((resolve, reject) => {
    createImageBitmap(file, { colorSpaceConversion: 'none' })
      .then((imageBitmap) => {
        const canvas = document.createElement("canvas");
        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;
        const ctx = canvas.getContext("2d", { colorSpace: "srgb", willReadFrequently: true });

        if (!ctx) {
          console.error("Could not get 2D context for comparison");
          imageBitmap.close();
          resolve(null);
          return;
        }
        ctx.drawImage(imageBitmap, 0, 0);
        imageBitmap.close();
        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          resolve(imageData);
        } catch (error) {
          console.error("Error getting image data for comparison:", error);
          resolve(null);
        }
      })
      .catch((error) => {
        console.error("Error loading comparison image with createImageBitmap:", error);
        resolve(null);
      });
  });
};

// Comparison Function
const compareImageFiles = async (
  file1: File,
  file2: File
): Promise<string> => {
  const [imageData1, imageData2] = await Promise.all([
    getImageDataFromFile(file1),
    getImageDataFromFile(file2),
  ]);

  if (!imageData1 || !imageData2) {
    return "Error: Could not load image data for one or both files.";
  }

  const width = imageData1.width;
  const height = imageData1.height;

  if (
    width !== imageData2.width ||
    height !== imageData2.height
  ) {
    return `Error: Image dimensions do not match. (${width}x${height} vs ${imageData2.width}x${imageData2.height})`;
  }

  // Define specific coordinates to check
  const targetHeight = Math.min(400, height); // Check up to y=399 or actual height
  const barWidth = width / 9;
  const targetXCoordinates = Array.from({ length: 9 }, (_, i) =>
    Math.floor(barWidth * i + barWidth / 2)
  );

  const data1 = imageData1.data;
  const data2 = imageData2.data;
  const mismatches: string[] = [];
  const maxMismatchesToShow = 20;
  let pixelsChecked = 0;
  const yStep = 50; // Check every 50 pixels vertically

  for (let y = 0; y < targetHeight; y += yStep) { // Step by yStep
    for (const x of targetXCoordinates) {
      if (x >= width) continue;

      pixelsChecked++;
      const index = (y * width + x) * 4;

      // Boundary check for data arrays
      if (index + 3 >= data1.length || index + 3 >= data2.length) {
        console.warn(`Skipping out-of-bounds index calculation at (${x}, ${y})`);
        continue;
      }

      const r1 = data1[index];
      const g1 = data1[index + 1];
      const b1 = data1[index + 2];
      const a1 = data1[index + 3];

      const r2 = data2[index];
      const g2 = data2[index + 1];
      const b2 = data2[index + 2];
      const a2 = data2[index + 3];

      if (r1 !== r2 || g1 !== g2 || b1 !== b2 || a1 !== a2) {
        if (mismatches.length < maxMismatchesToShow) {
          mismatches.push(
            `Pixel (${x}, ${y}):\n  File 1: R:${r1} G:${g1} B:${b1} A:${a1}\n  File 2: R:${r2} G:${g2} B:${b2} A:${a2}`
          );
        }
      }
    }
  }

  if (mismatches.length === 0) {
    return `Success: Files match pixel-perfectly at ${pixelsChecked} checked locations (y: 0-${targetHeight - 1} step ${yStep}, specific x coords)!`;
  } else {
    let message = `Mismatch: ${mismatches.length} differing pixels found out of ${pixelsChecked} checked locations (y: 0-${targetHeight - 1} step ${yStep}, specific x coords). Showing first ${Math.min(
      mismatches.length,
      maxMismatchesToShow
    )}:\n`;
    message += mismatches.join("\n");
    if (mismatches.length > maxMismatchesToShow) { // Check against maxMismatchesToShow
      message += "\n... (more mismatches exist)";
    }
    return message;
  }
};

export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [comparisonFile1, setComparisonFile1] = useState<File | null>(null);
  const [comparisonFile2, setComparisonFile2] = useState<File | null>(null);
  const [comparisonResult, setComparisonResult] = useState<string>("");
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const comparisonInput1Ref = useRef<HTMLInputElement>(null);
  const comparisonInput2Ref = useRef<HTMLInputElement>(null);

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

  const handleComparisonFileChange = (
    event: ChangeEvent<HTMLInputElement>,
    fileNumber: 1 | 2
  ) => {
    const file = event.target.files?.[0];
    if (file && file.type === "image/png") {
      if (fileNumber === 1) {
        setComparisonFile1(file);
      } else {
        setComparisonFile2(file);
      }
      setComparisonResult(""); // Clear previous results
    } else if (file) {
      alert("Please select a PNG file.");
      // Clear the input if it's not a PNG
      event.target.value = "";
    }
  };

  const handleCompareClick = useCallback(async () => {
    if (!comparisonFile1 || !comparisonFile2) {
      setComparisonResult("Please select both files to compare.");
      return;
    }
    setIsComparing(true);
    setComparisonResult("Comparing...");
    try {
      const result = await compareImageFiles(comparisonFile1, comparisonFile2);
      setComparisonResult(result);
    } catch (error) {
      console.error("Comparison failed:", error);
      setComparisonResult(`Error during comparison: ${error}`);
    }
    setIsComparing(false);
  }, [comparisonFile1, comparisonFile2]);

  const handleClearComparison = useCallback(() => {
    setComparisonFile1(null);
    setComparisonFile2(null);
    setComparisonResult("");
    if (comparisonInput1Ref.current) comparisonInput1Ref.current.value = "";
    if (comparisonInput2Ref.current) comparisonInput2Ref.current.value = "";
  }, []);

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

      {/* Comparison Card */}
      <div className="w-full max-w-lg bg-white p-6 sm:p-8 rounded-lg shadow-md mt-8">
        <h2 className="text-xl font-bold mb-4 text-center text-gray-800">
          Compare PNG Files
        </h2>
        <div className="space-y-4">
          {/* File Input 1 */}
          <div>
            <label
              htmlFor="compareFile1"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Generated File (e.g., your *_premult.png)
            </label>
            <input
              ref={comparisonInput1Ref}
              id="compareFile1"
              type="file"
              accept="image/png"
              onChange={(e) => handleComparisonFileChange(e, 1)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:pointer-events-none"
              disabled={isComparing}
            />
            {comparisonFile1 && (
              <p className="text-xs text-gray-600 mt-1">
                Selected: {comparisonFile1.name}
              </p>
            )}
          </div>

          {/* File Input 2 */}
          <div>
            <label
              htmlFor="compareFile2"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Reference File (e.g., ATEM export)
            </label>
            <input
              ref={comparisonInput2Ref}
              id="compareFile2"
              type="file"
              accept="image/png"
              onChange={(e) => handleComparisonFileChange(e, 2)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 disabled:opacity-50 disabled:pointer-events-none"
              disabled={isComparing}
            />
            {comparisonFile2 && (
              <p className="text-xs text-gray-600 mt-1">
                Selected: {comparisonFile2.name}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
             <button
              onClick={handleCompareClick}
              disabled={!comparisonFile1 || !comparisonFile2 || isComparing}
              className="flex-1 px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isComparing ? "Comparing..." : "Compare Files"}
            </button>
            <button
              onClick={handleClearComparison}
              disabled={isComparing}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              Clear Comparison
            </button>
          </div>

          {/* Comparison Results */}
          {comparisonResult && (
            <div className="mt-4 p-3 bg-gray-100 rounded border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">
                Comparison Result:
              </h3>
              <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words">
                {comparisonResult}
              </pre>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
