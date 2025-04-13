# ATEM PNG/TGA Pre-Multiplier

This web application converts standard PNG images into formats suitable for import into Blackmagic Design ATEM video switchers, handling the specific pre-multiplied alpha requirements.

This solves the common issue where PNGs with transparency don't display correctly when loaded directly into the ATEM media pool because the switcher expects alpha to be pre-multiplied into the RGB channels.

## Features

*   **Drag & Drop / File Selection:** Easily upload one or more PNG files.
*   **Output Formats:** Choose between:
    *   **PNG:** Pre-multiplied alpha PNG (ATEM compatible).
    *   **TGA (Beta):** 32-bit TGA with pre-multiplied alpha (ATEM compatible).
*   **Client-Side Processing:** All image conversion happens directly in your browser. No files are uploaded to a server.
*   **Pre-multiplied Alpha Calculation:** Correctly multiplies the R, G, and B values of each pixel by its alpha value using `floor` rounding.
*   **Download Results:** Download individual converted files or all files as a ZIP archive.

## Technology

*   [Next.js](https://nextjs.org/) (React Framework)
*   [TypeScript](https://www.typescriptlang.org/)
*   [Tailwind CSS](https://tailwindcss.com/)
*   [JSZip](https://stuk.github.io/jszip/) (for zipping files)
*   [FileSaver.js](https://github.com/eligrey/FileSaver.js/) (for triggering downloads)

## Running Locally

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Pimpmuckl/atem-png-converter.git
    cd atem-png-converter
    ```

2.  **Install dependencies:**
    Install root dependencies AND dependencies for the app itself.
    ```bash
    npm install # Install root dependencies (e.g., for next.config.js)
    cd app
    npm install # Install app dependencies
    ```

3.  **Run the development server:**
    From the `app` directory:
    ```bash
    npm run dev
    ```

4.  **Open the application:**
    Open [http://localhost:3000](http://localhost:3000) in your browser.

## How it Works

1.  The application uses `createImageBitmap` with the `colorSpaceConversion: 'none'` option to load the raw pixel data of the selected PNG, preserving the original color values without unwanted browser color space conversions.
2.  It iterates through each pixel of the image using a 2D Canvas context to access the raw RGBA data.
3.  For each pixel, it calculates the pre-multiplied color using the formula:
    *   `newRed = floor(originalRed * (alpha / 255))`
    *   `newGreen = floor(originalGreen * (alpha / 255))`
    *   `newBlue = floor(originalBlue * (alpha / 255))`
4.  The original alpha value is retained.
5.  Based on the user's selection:
    *   **PNG:** The pre-multiplied RGBA data is written back to a canvas, and `canvas.toBlob('image/png')` is used to generate the final PNG file.
    *   **TGA:** A TGA file is manually constructed byte-by-byte:
        *   An 18-byte header is created for an uncompressed, 32-bit, true-color image with a top-left origin.
        *   The pre-multiplied pixel data is written in **BGRA** order after the header.
        *   The complete header and pixel data are combined into a `Blob`.
6.  The resulting Blob (PNG or TGA) is made available for download.

## Important Note

⚠️ The generated PNG and TGA files use pre-multiplied alpha specifically formatted for Blackmagic ATEM switchers. They may not display correctly in standard image viewers or other applications and are not standard-compliant file formats in terms of how alpha is handled.
