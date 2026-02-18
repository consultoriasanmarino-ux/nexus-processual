import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

async function extractText(path) {
    const data = new Uint8Array(fs.readFileSync(path));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    let text = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const items = content.items;
        items.sort((a, b) => {
            if (Math.abs(a.transform[5] - b.transform[5]) > 5) {
                return b.transform[5] - a.transform[5];
            }
            return a.transform[4] - b.transform[4];
        });
        text += items.map(item => item.str).join(' ') + '\n\n';
    }
    console.log(text);
}

extractText('C:\\Users\\ACER\\Documents\\Loucura\\telefix\\1_CONTR8.pdf').catch(console.error);
