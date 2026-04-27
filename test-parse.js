const text = `
Here is the code:

\`\`\`jsx
// filename: src/App.jsx
console.log('hi');
\`\`\`

\`\`\`css
/* filename: src/App.css */
body { color: red; }
\`\`\`
`.trim();

const regex = /```(.*?)\n([\s\S]*?)```/g;
let match;
while ((match = regex.exec(text)) !== null) {
    const rawCode = match[2];
    const lines = rawCode.split('\n');
    let filenameMatch = null;
    let filename = '';
    let isContinuation = false;
    let codeStartIndex = 0;

    for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const line = lines[i].trim();
        const m = line.match(/^(?:\/\/|#|\/\*|<!--|--)\s*file(?:name)?:\s*(.+?)(?:\s*\(continuation\))?\s*(?:\*\/|-->)?\s*$/i);
        if (m) {
            filenameMatch = m;
            isContinuation = line.toLowerCase().includes('(continuation)');
            filename = m[1].trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
            codeStartIndex = i + 1;
            break;
        }
    }
  console.log("Found file:", filename)
}
