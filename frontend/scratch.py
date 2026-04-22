import sys

with open('src/components/MasterGrid.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

idx = -1
else_idx = -1
end_idx = -1

for i in range(100, len(lines)):
    if 'cellAllocs.length === 0 ? (' in lines[i]:
        idx = i
        break

if idx != -1:
    for j in range(idx, min(idx + 10, len(lines))):
        if ') : (' in lines[j]:
            else_idx = j
            break

if else_idx != -1:
    for k in range(else_idx, min(else_idx + 40, len(lines))):
        if '</div>' in lines[k] and ')}' in lines[k+1] and '</div>' in lines[k+2]:
            end_idx = k+1
            break

print('idx:', idx, 'else_idx:', else_idx, 'end_idx:', end_idx)

if end_idx != -1:
    lines[else_idx] = '                                      ) : (\n                                        <>\n'
    
    lines[end_idx] = lines[end_idx].replace(')}', '''  {/* Hover + indicator for adding another entry */}
                                          <div 
                                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                            onClick={(e) => { e.stopPropagation(); handleCellClick(day, time, s.id); }}
                                          >
                                            <div className="bg-[#262A36] hover:bg-[#2E3345] rounded-full w-5 h-5 flex items-center justify-center shadow border border-[#2E3345] cursor-pointer" title="Add another allocation">
                                              <span className="text-[#9CA3AF] font-bold text-xs leading-none">+</span>
                                            </div>
                                          </div>
                                        </>
                                      )}''')

    with open('src/components/MasterGrid.tsx', 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print('Success')
else:
    print('Failed to find indices')
