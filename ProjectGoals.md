# Project Goals

This is a small webapp that will support simply converting normal PNG files into PNGs with pre-multiplied alpha so they can be imported in Blackmagic ATEM switchers

## Functionality

Drag and drop (or choose via the file explorer) arbitrary PNG file or multiple files.

The user's client itself should then multiply each R, G and B value of each pixel with the pixel's alpha to create the premultiplied alpha file.

So, as example, if we have a pixel that has:
R=255, G=128, B=64, Alpha=0.5

After premultiplication, it would be:
R=127.5, G=64, B=32, Alpha=0.5

Then, the file or files are saved/downloaded with the _premult attached in it's name.

## Design

A simple, funcional but pretty webapp that automatically scales properly to web and mobile.