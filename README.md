# ATEM PNG Pre-Multiplier

This web application converts standard PNG images into PNGs with pre-multiplied alpha, suitable for import into Blackmagic Design ATEM video switchers.

This solves the common issue where PNGs with transparency don't display correctly when loaded directly into the ATEM media pool because the switcher expects alpha to be pre-multiplied into the RGB channels.

## Features

*   **Drag & Drop / File Selection:** Easily upload one or more PNG files.
*   **Client-Side Processing:** Image conversion happens directly in your browser using the Canvas API. No files are uploaded to a server.
*   **Pre-multiplied Alpha Calculation:** Correctly multiplies the R, G, and B values of each pixel by its alpha value.
*   **Download Results:** Download the converted files, automatically named with an `_premult` suffix.

## Technology

*   [Next.js](https://nextjs.org/) (React Framework)
*   [TypeScript](https://www.typescriptlang.org/)
*   [Tailwind CSS](https://tailwindcss.com/)

## Running Locally

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Pimpmuckl/atem-png-converter.git
    cd atem-png-converter
    ```

2.  **Install dependencies:**
    The web application code is inside the `app` directory.
    ```bash
    cd app
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```

4.  **Open the application:**
    Open [http://localhost:3000](http://localhost:3000) in your browser.

## How it Works

1.  The application uses `createImageBitmap` with the `colorSpaceConversion: 'none'` option to load the raw pixel data of the selected PNG, preserving the original color values without unwanted browser color space conversions.
2.  It iterates through each pixel of the image using a 2D Canvas context.
3.  For each pixel, it calculates the pre-multiplied color using the formula:
    *   `newRed = floor(originalRed * (alpha / 255))`
    *   `newGreen = floor(originalGreen * (alpha / 255))`
    *   `newBlue = floor(originalBlue * (alpha / 255))`
4.  The original alpha value is retained.
5.  The modified pixel data is written back to the canvas.
6.  The canvas content is converted into a new PNG Blob, which is then made available for download.
