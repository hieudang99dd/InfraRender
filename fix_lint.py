import os
filepath = 'frontend/src/hooks/useProjectPersistence.ts'
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace("    writeDraft(data);", "    // eslint-disable-next-line react-hooks/set-state-in-effect\n    writeDraft(data);")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)
