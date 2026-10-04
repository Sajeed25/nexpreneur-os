# Rebuilding the user manual

The manual is HTML (`parts/*.html`) styled by `style.css`, printed to A4 PDF with Microsoft Edge headless, and page numbers in the contents are filled in automatically.

    cd docs/manual-src
    npm init -y && npm i pdfjs-dist
    node build.js ../Nexpreneur-OS-User-Manual.pdf

Needs Node 18+ and Microsoft Edge. Edit the text in `parts/`, then rebuild. Fonts: Outfit (OFL), in `fonts/`.
