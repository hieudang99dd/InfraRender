import fs
const content = fs.readFileSync('frontend/src/components/layout/RightPanel.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
  if (line.toLowerCase().includes('prompt') || line.toLowerCase().includes('tạo')) {
    console.log(`${i+1}: ${line.trim()}`);
  }
});
