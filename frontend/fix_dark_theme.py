import sys

# Covers both inline styles (no quotes around #hex) and Tailwind bracket notation [#hex]
replacements = {
    '#FBFBFB': '#0D0F14',
    '#E8F9FF': '#1C1F2A',
    '#C4D9FF': '#2E3345',
    '#a8c4f0': '#2E3345',
    '#C5BAFF': '#C4B5FD',
    '#b0a3f0': '#A78BFA',
    '#1a1a1a': '#E5E7EB',
    '#3a3a5c': '#9CA3AF',
    '#FFFFFF': '#242838',
    '#2B2B2B': '#E5E7EB',
    '#5A5A5A': '#9CA3AF',
    '#d1fae5': '#A3E635',
}

for filepath in sys.argv[1:]:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    for old, new in replacements.items():
        content = content.replace(old, new)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Updated: {filepath}")
